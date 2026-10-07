import { expect, it } from 'vitest'
import { calorieInputs, estimateCalories } from './calories'
import { emptyState } from './storage'
import { startWorkout } from './domain'

it('separates active energy from resting energy for an 80 kg one-hour session', () => {
  expect(estimateCalories({ weightKg: 80, minutes: 60, intensity: 'standard' }, 12)).toEqual({ active: 210, total: 294 })
  expect(estimateCalories({ weightKg: 80, minutes: 60, intensity: 'vigorous' }, 12)).toEqual({ active: 420, total: 504 })
})
it('does not invent calories without performed sets, weight or valid duration', () => {
  for (const minutes of [0, -10, NaN, Infinity]) expect(estimateCalories({ weightKg: 80, minutes, intensity: 'standard' }, 1)).toBeNull()
  expect(estimateCalories({ weightKg: 0, minutes: 60, intensity: 'standard' }, 1)).toBeNull()
  expect(estimateCalories({ weightKg: 80, minutes: 60, intensity: 'standard' }, 0)).toBeNull()
})
it('uses historical body weight, excludes future weigh-ins, and preserves a saved correction', () => {
  const data = emptyState(); const w = startWorkout(null)
  w.startedAt = '2026-10-01T12:00:00Z'; w.finishedAt = '2026-10-01T13:00:00Z'
  data.bodyWeights = [{ id: 'old', date: '2026-09-30', valueKg: 80 }, { id: 'future', date: '2026-10-02', valueKg: 90 }]
  expect(calorieInputs(data, w)).toEqual({ weightKg: 80, minutes: 60, intensity: 'standard' })
  w.calorieInputs = { weightKg: 81, minutes: 40, intensity: 'vigorous' }
  expect(calorieInputs(data, w)).toEqual(w.calorieInputs)
})
