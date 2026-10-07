import type { AppState, Workout } from './types'

export function calorieInputs(data: AppState, workout: Workout) {
  if (workout.calorieInputs) return workout.calorieInputs
  const end = Date.parse(workout.finishedAt ?? '')
  const weight = data.bodyWeights.filter(e => Number.isFinite(e.valueKg) && e.valueKg > 0 && Date.parse(e.date) <= end)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0]
  return { weightKg: weight?.valueKg ?? 0, minutes: Math.max(0, (end - Date.parse(workout.startedAt)) / 60000), intensity: 'standard' as const }
}

export function estimateCalories(inputs: { weightKg: number; minutes: number; intensity: 'standard' | 'vigorous' }, completedSets: number) {
  if (completedSets <= 0 || !Number.isFinite(inputs.weightKg) || inputs.weightKg <= 0 || !Number.isFinite(inputs.minutes) || inputs.minutes <= 0) return null
  // Compendium 2024, conditioning exercise codes 02054 and 02050.
  // Session-level METs include normal between-set recovery, not just lifting time.
  const met = inputs.intensity === 'vigorous' ? 6 : 3.5
  const resting = 3.5 * inputs.weightKg / 200 * inputs.minutes
  return { active: Math.round((met - 1) * resting), total: Math.round(met * resting) }
}
