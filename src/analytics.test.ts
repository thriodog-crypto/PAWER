import { expect, it } from 'vitest'
import { emptyState } from './storage'
import { analytics, analyticsData, bodyEntriesInPeriod } from './analytics'
import type { Workout } from './types'

const now = new Date('2026-10-01T12:00:00')
function fixture() {
  const data = emptyState()
  data.definitions = [{ id: 'live', name: 'Тяга', createdAt: '' }, { id: 'deleted', name: 'Шутка', archived: true, createdAt: '' }]
  data.workouts = []
  return data
}
function workout(date: string, weight = 40, id = 'live', loadType: 'external' | 'bodyweight' = 'external'): Workout {
  return { id: date + id, programId: null, programName: '', programSnapshot: null, status: 'completed', startedAt: date, finishedAt: date, currentExerciseIndex: 0, currentSetIndex: 0, timer: null, exercises: [{ id: 'e', exerciseDefinitionId: id, name: id, unit: 'kg', loadType, restBetweenSec: 0, restAfterSec: 0, note: '', sets: [{ id: 's', templateSetId: '', weightInput: '', weightKg: null, repsInput: '', actualWeightInput: String(weight), actualWeightKg: weight, actualRepsInput: '10', status: 'completed' }] }] }
}
it('excludes archived, unknown, empty and future sessions without mutating history', () => {
  const data = fixture()
  const empty = workout('2026-09-30T12:00:00'); empty.exercises[0].sets[0].status = 'skipped'
  data.workouts = [workout('2026-09-29T12:00:00'), workout('2026-09-28', 20, 'deleted'), workout('2026-09-27', 20, 'unknown'), empty, workout('2026-10-02')]
  const result = analytics(data, 30, now)
  expect(result.count).toBe(1)
  expect(result.volume).toBe(400)
  expect(result.series.map(s => s.name)).toEqual(['Тяга'])
  expect(data.workouts).toHaveLength(5)
})
it('compares equal periods and counts improvements rather than first observations as PRs', () => {
  const data = fixture()
  data.workouts = [workout('2026-08-20', 30), workout('2026-09-20', 40), workout('2026-09-25', 50)]
  const result = analytics(data, 30, now)
  expect(result.volume).toBe(900)
  expect(result.previousVolume).toBe(300)
  expect(result.prCount).toBe(2)
  expect(result.records[0].value).toBe(50)
  expect(result.strengthChange).toBeCloseTo(66.6667, 3)
})
it('keeps bodyweight repetitions out of kilogram volume and strength series', () => {
  const data = fixture(); data.workouts = [workout('2026-09-28', 0, 'live', 'bodyweight')]
  const result = analytics(data, 7, now)
  expect(result.count).toBe(1)
  expect(result.volume).toBe(0)
  expect(result.series).toEqual([])
  expect(result.records[0]).toMatchObject({ value: 10, unit: 'повт.' })
  expect(result.prCount).toBe(0)
  expect(result.strengthChange).toBeNull()
})
it('uses local day boundaries and the current Monday-based week independently of selected period', () => {
  const data = fixture()
  data.workouts = [workout('2026-09-24T23:59:59'), workout('2026-09-25T00:00:00'), workout('2026-09-27T12:00:00'), workout('2026-09-28T00:00:00'), workout('2026-10-01T11:59:00')]
  const result = analytics(data, 7, now)
  expect(result.count).toBe(4)
  expect(result.previousCount).toBe(1)
  expect(result.weeklyCount).toBe(2)
  expect(result.buckets.reduce((sum, b) => sum + b.value, 0)).toBe(1600)
})
it('ignores invalid sets and sums repeated exercise entries within a session', () => {
  const data = fixture(); const w = workout('2026-09-28T12:00:00')
  w.exercises.push({ ...w.exercises[0], id: 'second', sets: [{ ...w.exercises[0].sets[0], actualWeightKg: 50 }] })
  w.exercises[0].sets.push({ ...w.exercises[0].sets[0], actualRepsInput: '' }, { ...w.exercises[0].sets[0], actualWeightKg: -20 })
  data.workouts = [w]
  const result = analytics(data, 30, now)
  expect(result.volume).toBe(900)
  expect(result.series[0].points[0].value).toBe(50)
  expect(result.count).toBe(1)
})
it('preserves workout order for detail screens while calculating chronological records', () => {
  const data = fixture(); data.workouts = [workout('2026-09-30', 50), workout('2026-09-20', 40)]
  expect(analyticsData(data, now).workouts[0].finishedAt).toBe('2026-09-30')
  expect(analytics(data, 30, now).prCount).toBe(1)
})
it('includes today’s noon-dated body entry before noon but excludes tomorrow', () => {
  const entries = [{ date: '2026-10-01T12:00:00', value: 80 }, { date: '2026-10-02T12:00:00', value: 79 }]
  expect(bodyEntriesInPeriod(entries, new Date('2026-09-01'), new Date('2026-10-01T09:00:00'))).toEqual([entries[0]])
})
