import type { AppState, CoachFeedback, WorkoutExercise } from './types'

export function normalizeCoachData(data: AppState): AppState {
  const next = structuredClone(data)
  if (!['playful', 'neutral'].includes(next.settings.coachTone ?? '')) delete next.settings.coachTone
  if (Array.isArray(next.settings.trainingDays)) next.settings.trainingDays = [...new Set(next.settings.trainingDays.filter(n => Number.isInteger(n) && n >= 0 && n <= 6))]
  else delete next.settings.trainingDays
  if (!Number.isFinite(Date.parse(next.settings.coachBackupAt ?? ''))) delete next.settings.coachBackupAt
  for (const d of next.definitions) if (!d.loadStep || !Number.isFinite(d.loadStep.value) || d.loadStep.value <= 0 || !['kg', 'lb'].includes(d.loadStep.unit)) delete d.loadStep
  for (const w of next.workouts) {
    if (!['good', 'fatigued', 'symptoms'].includes(w.startWellbeing ?? '')) delete w.startWellbeing
    const f = w.coachFeedback
    if (f && typeof f === 'object' && !Array.isArray(f)) {
      if (!['normal', 'light', 'returning', 'time'].includes(f.context ?? '')) delete f.context
      if (!['good', 'fatigued', 'symptoms'].includes(f.wellbeing ?? '')) delete f.wellbeing
      if (!Number.isFinite(Date.parse(f.reviewedAt ?? ''))) delete f.reviewedAt
      if (typeof f.phraseId !== 'string') delete f.phraseId
    } else delete w.coachFeedback
    for (const e of w.exercises) {
      if (!['easy', 'normal', 'limit'].includes(e.effort ?? '')) delete e.effort
      if (typeof e.equipmentSnapshot !== 'string') delete e.equipmentSnapshot
    }
  }
  return next
}

export async function prepareCoachFeedback(data: AppState, id: string, feedback: CoachFeedback, efforts: Record<string, WorkoutExercise['effort']>, backup: (state: AppState) => Promise<unknown>): Promise<AppState> {
  if (!data.workouts.some(w => w.id === id && w.status === 'completed')) throw Error('Тренировка не найдена')
  if (!data.settings.coachBackupAt) await backup(data)
  const next = structuredClone(data)
  next.settings.coachBackupAt ??= new Date().toISOString()
  const w = next.workouts.find(w => w.id === id)!
  w.coachFeedback = { ...feedback, reviewedAt: new Date().toISOString() }
  w.exercises.forEach(e => { e.effort = efforts[e.id] })
  return normalizeCoachData(next)
}
