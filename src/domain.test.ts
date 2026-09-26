import { describe, expect, it } from 'vitest'
import type { ActualSet, AppState, Program, Workout } from './types'
import { compareSets, fromKg, nextPosition, previousWorkoutForExercise, startWorkout, switchExerciseUnit, timerRemaining, toKg } from './domain'

const actual = (weightKg: number, reps: number, status: ActualSet['status'] = 'completed'): ActualSet => ({
  id: crypto.randomUUID(), templateSetId: crypto.randomUUID(), weightInput: `${weightKg}`, weightKg,
  repsInput: `${reps}`, actualWeightInput: `${weightKg}`, actualWeightKg: weightKg,
  actualRepsInput: `${reps}`, status,
})

const baseProgram = (): Program => ({
  id: 'program', name: 'Full Body', createdAt: '2025-01-01', updatedAt: '2025-01-01', exercises: [{
    id: 'program-exercise', exerciseDefinitionId: 'lat-pulldown', name: 'Тяга сверху', unit: 'lb', loadType: 'external', restBetweenSec: 90, restAfterSec: 180, note: '', sets: [
      { id: 's1', weightInput: '140', weightKg: toKg(140, 'lb'), repsInput: '10' },
      { id: 's2', weightInput: '140', weightKg: toKg(140, 'lb'), repsInput: '9' },
      { id: 's3', weightInput: '140', weightKg: toKg(140, 'lb'), repsInput: '8' },
    ],
  }, {
    id: 'program-exercise-2', exerciseDefinitionId: 'squat', name: 'Присед', unit: 'kg', loadType: 'external', restBetweenSec: 60, restAfterSec: 0, note: '', sets: [{ id: 'q1', weightInput: '60', weightKg: 60, repsInput: '8' }],
  }],
})

describe('unit conversion', () => {
  it('uses the exact pounds conversion and does not accumulate rounding', () => {
    expect(toKg(140, 'lb')).toBeCloseTo(63.5029318, 7)
    const program = baseProgram(); const originalKg = program.exercises[0].sets[0].weightKg!
    const kg = switchExerciseUnit(program.exercises[0], 'kg')
    const back = switchExerciseUnit(kg, 'lb')
    expect(back.sets[0].weightKg).toBe(originalKg)
    expect(fromKg(back.sets[0].weightKg!, 'lb')).toBeCloseTo(140, 10)
  })
})

describe('set comparison', () => {
  const previous = actual(60, 8)
  it('reports fewer reps at same weight', () => expect(compareSets(actual(60, 7), previous).kind).toBe('worse'))
  it('reports more reps at same weight', () => expect(compareSets(actual(60, 9), previous).kind).toBe('better'))
  it('reports more weight at same reps', () => expect(compareSets(actual(65, 8), previous).kind).toBe('better'))
  it('does not give a single verdict when weight rises and reps fall', () => expect(compareSets(actual(65, 6), previous).kind).toBe('mixed'))
  it('keeps skipped sets distinct', () => expect(compareSets(actual(60, 0, 'skipped'), previous).kind).toBe('skipped'))
})

describe('timer transitions', () => {
  const workout = startWorkout(baseProgram())
  it('uses between-set rest after an intermediate set', () => expect(nextPosition(workout, 0, 0)).toEqual({ exerciseIndex: 0, setIndex: 1, restKind: 'between', restSec: 90 }))
  it('uses only after-exercise rest after the last set', () => expect(nextPosition(workout, 0, 2)).toEqual({ exerciseIndex: 1, setIndex: 0, restKind: 'after', restSec: 180 }))
  it('starts no rest after the last workout set', () => expect(nextPosition(workout, 1, 0)).toBeNull())
  it('calculates time from the persisted deadline', () => expect(timerRemaining({ endAt: 12_000, remainingSec: 90, paused: false }, 7_400)).toBe(5))
  it('preserves explicit pause duration', () => expect(timerRemaining({ endAt: null, remainingSec: 37, paused: true }, 999_999)).toBe(37))
})

describe('history independence', () => {
  it('snapshots a program and does not mutate it during a workout', () => {
    const program = baseProgram(); const workout = startWorkout(program)
    workout.exercises[0].sets[2].actualRepsInput = '7'
    workout.exercises[0].sets[2].status = 'completed'
    expect(program.exercises[0].sets[2].repsInput).toBe('8')
    program.exercises[0].name = 'Переименованная тяга'
    expect(workout.programSnapshot?.exercises[0].name).toBe('Тяга сверху')
    expect(workout.exercises[0].exerciseDefinitionId).toBe('lat-pulldown')
  })

  it('prefers the latest result from the same program before a newer fallback', () => {
    const current = startWorkout(baseProgram())
    current.id = 'current'
    const sameProgram = { ...startWorkout(baseProgram()), id: 'same', status: 'completed' as const, finishedAt: '2025-02-01T10:00:00.000Z' }
    const otherProgram = { ...startWorkout({ ...baseProgram(), id: 'other' }), id: 'other-workout', status: 'completed' as const, finishedAt: '2025-03-01T10:00:00.000Z' }
    const state = { version: 1, definitions: [], programs: [], workouts: [current, otherProgram, sameProgram], bodyWeights: [], measurements: [], imports: [], settings: { sound: false, vibration: false, keepAwake: false } } satisfies AppState
    expect(previousWorkoutForExercise(state, current, 'lat-pulldown')?.id).toBe('same')
  })
})
