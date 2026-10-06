import { expect, it } from 'vitest'
import { emptyState } from './storage'
import { makeExercise, makeProgram, startWorkout } from './domain'
import { getCoachAdvice, isFullProgram, nextTrainingDate, selectCoachPhrase } from './coach'
import type { AppState, Workout } from './types'

export function coachFixture(count = 2): AppState {
  const data = emptyState(); const p = makeProgram(); const e = makeExercise('Тяга')
  e.exerciseDefinitionId = 'row'; e.sets.forEach((s, i) => { s.id = `s${i}`; s.weightKg = 40; s.weightInput = '40'; s.repsInput = '10' })
  p.exercises.push(e); data.programs.push(p)
  data.definitions.push({ id: 'row', name: 'Тяга', createdAt: '', equipment: 'блок', loadStep: { value: 2, unit: 'kg' } })
  data.workouts = Array.from({ length: count }, (_, i) => {
    const w = startWorkout(p); w.id = `w${i}`; w.status = 'completed'; w.startedAt = w.finishedAt = `2026-09-${String(10 + i * 2).padStart(2, '0')}T12:00:00Z`
    w.coachFeedback = { context: 'normal', wellbeing: 'good' }
    w.exercises[0].effort = 'easy'; w.exercises[0].equipmentSnapshot = 'блок'
    w.exercises[0].sets.forEach(s => { s.status = 'completed' })
    return w
  })
  return data
}
const advice = (data: AppState) => getCoachAdvice(data, data.workouts.at(-1)!.id)[0]
it('offers one extra rep only after two comparable easy ordinary workouts', () => {
  expect(advice(coachFixture()).kind).toBe('add-rep')
  expect(advice(coachFixture()).targetReps).toBe(11)
  expect(advice(coachFixture(1)).kind).toBe('hold')
})
it('requires four stages before offering a known weight step', () => {
  const d = coachFixture(4)
  d.workouts.slice(2).forEach(w => { w.exercises[0].sets[0].actualRepsInput = '11' })
  expect(advice(d)).toMatchObject({ kind: 'add-weight', targetWeightKg: 42 })
  d.definitions[0].loadStep!.value = 5
  expect(advice(d).kind).toBe('add-rep')
  delete d.definitions[0].loadStep
  expect(advice(d).kind).toBe('hold')
})
it.each(['returning', 'light', 'time', undefined] as const)('does not recommend progression for context %s', context => {
  const d = coachFixture(); d.workouts[1].coachFeedback!.context = context
  expect(['hold', 'check-in']).toContain(advice(d).kind)
})
it.each(['symptoms', 'fatigued', undefined] as const)('does not recommend progression for wellbeing %s', wellbeing => {
  const d = coachFixture(); d.workouts[1].coachFeedback!.wellbeing = wellbeing
  expect(['hold', 'check-in']).toContain(advice(d).kind)
})
it('does not skip unknown or returning sessions between healthy sessions', () => {
  const d = coachFixture(3); d.workouts[1].coachFeedback = { context: 'returning' }
  expect(advice(d).kind).toBe('hold')
})
it('does not combine different plans, unknown equipment, variable weights or duplicate entries', () => {
  for (const mutate of [
    (w: Workout) => { w.exercises[0].sets[0].repsInput = '8' },
    (w: Workout) => { delete w.exercises[0].equipmentSnapshot },
    (w: Workout) => { w.exercises[0].sets[0].actualWeightKg = 45 },
    (w: Workout) => { w.exercises.push(structuredClone(w.exercises[0])) },
  ]) { const d = coachFixture(); mutate(d.workouts[1]); expect(advice(d).kind).toBe('hold') }
})
it('does not turn bodyweight, assisted or zero loads into numeric increases', () => {
  for (const type of ['bodyweight', 'assisted'] as const) {
    const d = coachFixture(4); d.workouts.forEach(w => { w.exercises[0].loadType = type; w.exercises[0].sets[0].actualRepsInput = '11' })
    expect(advice(d).targetWeightKg).toBeUndefined()
  }
})
it('recognizes equivalent kg/lb values without comparing display strings', () => {
  const d = coachFixture(); d.workouts[0].exercises[0].unit = 'lb'
  expect(advice(d).kind).toBe('add-rep')
})
it('one difficult session does not lower weight; two can suggest one lower step', () => {
  const d = coachFixture(); const e = d.workouts[1].exercises[0]; e.effort = 'limit'; e.sets[0].actualRepsInput = '8'
  expect(advice(d).kind).toBe('hold')
  d.workouts[0].exercises[0].effort = 'limit'; d.workouts[0].exercises[0].sets[0].actualRepsInput = '8'
  expect(advice(d)).toMatchObject({ kind: 'reduce', targetWeightKg: 38 })
})
it('excludes archived definitions and future workouts', () => {
  const d = coachFixture(); d.definitions[0].archived = true
  expect(getCoachAdvice(d, 'w1')).toEqual([])
  delete d.definitions[0].archived; d.workouts[1].finishedAt = '2099-01-01'
  expect(getCoachAdvice(d, 'w1')).toEqual([])
})
it('checks the original full plan rather than remaining exercises', () => {
  const w = coachFixture().workouts[0]; expect(isFullProgram(w)).toBe(true)
  w.exercises[0].sets.pop(); expect(isFullProgram(w)).toBe(false)
  w.programSnapshot = null; expect(isFullProgram(w)).toBe(false)
})
it('selects protective phrases before records and avoids recent phrase ids', () => {
  const d = coachFixture(5); d.workouts[4].coachFeedback!.context = 'returning'
  expect(selectCoachPhrase(d, 'w4').art).toBe('phrases/returning-0')
  d.workouts[4].coachFeedback!.context = 'normal'
  const seen = new Set<string>()
  for (const w of d.workouts) { const p = selectCoachPhrase(d, w.id); expect(seen.has(p.id)).toBe(false); seen.add(p.id); w.coachFeedback!.phraseId = p.id }
  expect(selectCoachPhrase(d, 'w4').id).toBe(d.workouts[4].coachFeedback!.phraseId)
})
it('assigns different illustrations to different phrase variants, stable on reopening', () => {
  const d = coachFixture(5)
  const images = new Set<string>()
  for (const w of d.workouts) {
    const p = selectCoachPhrase(d, w.id)
    expect(images.has(p.art)).toBe(false)
    images.add(p.art); w.coachFeedback!.phraseId = p.id
    expect(selectCoachPhrase(d, w.id).art).toBe(p.art)
  }
})
it('uses every illustration in a context before repeating one, even after a tone change', () => {
  const d = coachFixture(7)
  const arts: string[] = []
  for (const w of d.workouts) {
    w.coachFeedback!.context = 'light'
    if (w.id === 'w3') d.settings.coachTone = 'neutral'
    const p = selectCoachPhrase(d, w.id); arts.push(p.art); w.coachFeedback!.phraseId = p.id
  }
  expect(new Set(arts.slice(0, 6)).size).toBe(6)
  expect(arts[6]).toBe(arts[0])
})
it('plans local calendar dates without claiming recovery', () => {
  expect(nextTrainingDate([], new Date(2026, 9, 4))).toBeNull()
  const next = nextTrainingDate([1], new Date(2026, 9, 4, 12))!
  expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2026, 9, 5])
})
it('does not erase pre-workout symptoms with a positive finish rating', () => {
  const data = coachFixture(); const w = data.workouts[data.workouts.length - 1]
  Object.assign(w, { startWellbeing: 'symptoms' })
  expect(getCoachAdvice(data, w.id)[0].kind).toBe('check-in')
})
it('does not reward a reduced original program as full or progress its reduced exercise', () => {
  const d = coachFixture()
  d.workouts.forEach(w => w.exercises[0].sets.pop())
  expect(advice(d).kind).toBe('hold')
  const w = coachFixture().workouts[1]
  w.exercises[0].sets.forEach(s => { s.actualRepsInput = '1'; s.actualWeightKg = 1 })
  expect(isFullProgram(w)).toBe(false)
})
