import { expect, it } from 'vitest'
import { emptyState, backupJson, parseBackup } from './storage'
import { makeExercise, makeProgram, startWorkout } from './domain'
import { normalizeCoachData, prepareCoachFeedback } from './coachData'

it('preserves legacy data without inventing feedback', () => {
  const data = emptyState()
  expect(normalizeCoachData(data)).toEqual(data)
  expect(parseBackup(backupJson(data))).toEqual(data)
})
it('discards invalid coach fields without modifying the original state', () => {
  const data = emptyState()
  Object.assign(data.settings, { coachTone: 'bad', trainingDays: [0, 0, 3, 7, -1, '2'] })
  data.definitions.push({ id: 'e', name: 'e', createdAt: '', loadStep: { value: -2, unit: 'kg' } })
  const clean = normalizeCoachData(data)
  expect(clean.settings.trainingDays).toEqual([0, 3])
  expect(clean.settings.coachTone).toBeUndefined()
  expect(clean.definitions[0].loadStep).toBeUndefined()
  expect(data.definitions[0].loadStep?.value).toBe(-2)
})
it('does not inherit effort from a program created by spreading a workout exercise', () => {
  const p = makeProgram(); p.exercises.push(Object.assign(makeExercise(), { effort: 'easy' }))
  expect(startWorkout(p).exercises[0].effort).toBeUndefined()
})
it('takes a backup before feedback and leaves original untouched on failure', async () => {
  const data = emptyState(); const w = startWorkout(null); w.status = 'completed'; data.workouts.push(w)
  await expect(prepareCoachFeedback(data, w.id, { context: 'normal' }, {}, async () => { throw Error('disk') })).rejects.toThrow('disk')
  expect(data.workouts[0].coachFeedback).toBeUndefined()
  let backups = 0
  const next = await prepareCoachFeedback(data, w.id, { context: 'normal', wellbeing: 'good' }, {}, async () => { backups++ })
  expect(backups).toBe(1)
  expect(next.workouts[0].coachFeedback?.context).toBe('normal')
  expect(parseBackup(backupJson(next)).workouts[0].coachFeedback?.wellbeing).toBe('good')
  await prepareCoachFeedback(next, w.id, {}, {}, async () => { backups++ })
  expect(backups).toBe(1)
})
