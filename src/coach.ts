import type { ActualSet, AppState, Workout, WorkoutExercise } from './types'
import { parseReps, toKg } from './domain'
import { coachCopy, type CoachContext } from './coachCopy'
export interface CoachAdvice { exerciseId: string; kind: 'hold'|'add-rep'|'add-weight'|'reduce'|'check-in'; reason: string; targetWeightKg?: number; targetReps?: number; sourceUrls: string[] }
export const coachSources = ['https://acsm.org/resistance-training-guidelines-update-2026/', 'https://pubmed.ncbi.nlm.nih.gov/19204579/', 'https://pubmed.ncbi.nlm.nih.gov/36199287/']
const stamp = (w: Workout) => Date.parse(w.finishedAt ?? w.startedAt)
const ordinary = (w: Workout) => w.coachFeedback?.context === 'normal' && w.coachFeedback?.wellbeing === 'good' && w.startWellbeing !== 'symptoms' && w.startWellbeing !== 'fatigued'
const valid = (s: ActualSet, e: WorkoutExercise) => s.status === 'completed' && (parseReps(s.actualRepsInput) ?? 0) > 0 && (e.loadType === 'bodyweight' || (s.actualWeightKg !== null && Number.isFinite(s.actualWeightKg) && s.actualWeightKg >= 0))
const sameWeight = (a: number | null, b: number | null) => a === b || (a !== null && b !== null && Math.abs(a - b) < .001)
const hit = (e: WorkoutExercise) => e.sets.length > 0 && e.sets.every(s => valid(s, e) && (parseReps(s.actualRepsInput) ?? 0) >= (parseReps(s.repsInput) ?? Infinity))
const extra = (e: WorkoutExercise) => hit(e) && e.sets.some(s => (parseReps(s.actualRepsInput) ?? 0) > (parseReps(s.repsInput) ?? Infinity))
const completedCount = (w: Workout) => w.exercises.reduce((n, e) => n + e.sets.filter(s => valid(s, e)).length, 0)

function comparable(a: WorkoutExercise, b: WorkoutExercise): boolean {
  return a.loadType === b.loadType && a.equipmentSnapshot !== undefined && a.equipmentSnapshot === b.equipmentSnapshot && a.sets.length > 0 && a.sets.length === b.sets.length && a.sets.every((s, i) => {
    const t = b.sets[i]
    return (parseReps(s.repsInput) ?? 0) > 0 && parseReps(s.repsInput) === parseReps(t.repsInput) && sameWeight(s.weightKg, t.weightKg) && sameWeight(s.weightKg, a.sets[0].weightKg) && sameWeight(s.actualWeightKg, s.weightKg) && sameWeight(t.actualWeightKg, t.weightKg)
  })
}

function unchangedPlan(w: Workout, e: WorkoutExercise): boolean {
  if (!w.programSnapshot) return true
  const p = w.programSnapshot.exercises.find(p => p.id === e.id && p.exerciseDefinitionId === e.exerciseDefinitionId)
  return !!p && p.loadType === e.loadType && p.sets.length === e.sets.length && p.sets.every(s => {
    const actual = e.sets.find(a => a.templateSetId === s.id)
    return !!actual && parseReps(actual.repsInput) === parseReps(s.repsInput) && sameWeight(actual.weightKg, s.weightKg)
  })
}

export function getCoachAdvice(data: AppState, id: string): CoachAdvice[] {
  const workout = data.workouts.find(w => w.id === id)
  if (!workout || workout.status !== 'completed' || !Number.isFinite(stamp(workout)) || stamp(workout) > Date.now()) return []
  const history = data.workouts.filter(w => w.status === 'completed' && stamp(w) <= stamp(workout)).slice().sort((a, b) => stamp(b) - stamp(a))
  return [...new Set(workout.exercises.map(e => e.exerciseDefinitionId))].flatMap(defId => {
    const definition = data.definitions.find(d => d.id === defId && !d.archived)
    const e = workout.exercises.find(e => e.exerciseDefinitionId === defId)!
    if (!definition || !e.sets.some(s => valid(s, e))) return []
    const base: CoachAdvice = { exerciseId: defId, kind: 'hold', reason: 'Пока недостаточно сравнимых оценённых тренировок. Не меняй нагрузку только по этой записи.', sourceUrls: coachSources }
    if (workout.coachFeedback?.wellbeing === 'symptoms' || workout.startWellbeing === 'symptoms') return [{ ...base, kind: 'check-in' as const, reason: 'Отмечены боль или симптомы. Не увеличивай нагрузку; при необходимости обсуди возвращение к тренировкам со специалистом.' }]
    if (workout.coachFeedback?.context === 'returning') return [{ ...base, kind: 'check-in' as const, reason: 'Возвращение после болезни — отдельный режим, не неудача. Эта тренировка не станет основанием для повышения нагрузки.', sourceUrls: ['https://bjsm.bmj.com/content/56/19/1066'] }]
    if (!ordinary(workout) || !e.effort) return [{ ...base, reason: 'Для прогрессии нужны обычные тренировки, хорошее самочувствие и оценки усилия. Сейчас нагрузку не повышаем.' }]
    const sessions: WorkoutExercise[] = []
    const dates: string[] = []
    for (const w of history) {
      if (!ordinary(w)) break
      const matches = w.exercises.filter(x => x.exerciseDefinitionId === defId)
      if (!matches.length) continue
      if (matches.length !== 1 || !matches[0].effort || !unchangedPlan(w, matches[0]) || !comparable(e, matches[0])) break
      sessions.push(matches[0]); dates.push(new Date(stamp(w)).toLocaleDateString('ru'))
      if (sessions.length === 4) break
    }
    if (sessions.length < 2) return [base]
    const pair = sessions.slice(0, 2)
    const evidence = `Сравнение ${dates[1]} и ${dates[0]}: `
    const weight = e.sets[0].actualWeightKg ?? 0
    const step = definition.loadStep ? toKg(definition.loadStep.value, definition.loadStep.unit) : undefined
    if (pair.every(x => x.effort === 'limit' && !hit(x))) {
      if (e.loadType === 'external' && step && step < weight && step / weight <= .1) return [{ ...base, kind: 'reduce', targetWeightKg: weight - step, reason: evidence + 'дважды не выполнен план и отмечено «На пределе». Проверь отдых и технику; можно попробовать на один доступный шаг меньше, не меняя число подходов.' }]
      return [{ ...base, reason: evidence + 'дважды было тяжело выполнить план. Проверь отдых и технику; без подходящего шага веса точное снижение не предлагаю.' }]
    }
    if (!pair.every(x => x.effort === 'easy' && hit(x))) return [{ ...base, reason: evidence + 'пока нет двух лёгких выполнений плана подряд. Не спеши увеличивать нагрузку.' }]
    if (sessions.length === 4 && sessions.every(x => x.effort === 'easy' && hit(x)) && pair.every(extra) && sessions.slice(2).every(x => !extra(x))) {
      if (e.loadType === 'external' && weight > 0) {
        if (!step) return [{ ...base, reason: 'Есть две базовые лёгкие тренировки и две с дополнительными повторами. Укажи доступный шаг веса в настройках упражнения — не буду его угадывать.' }]
        if (step / weight <= .1) return [{ ...base, kind: 'add-weight', targetWeightKg: weight + step, reason: evidence + 'дважды выполнены дополнительные повторы с запасом после двух базовых тренировок. Можно попробовать один шаг веса и вернуться к плановым повторам.' }]
      }
    }
    if (e.loadType === 'assisted') return [{ ...base, reason: 'Для противовеса нужна отдельная оценка техники и помощи. Автоматическое изменение килограммов не предлагаю.' }]
    return [{ ...base, kind: 'add-rep', targetReps: (parseReps(e.sets[0].actualRepsInput) ?? 0) + 1, reason: evidence + 'весь план выполнен с оценкой «Легко». Попробуй один дополнительный повтор только в первом подходе; вес и число подходов оставь прежними.' }]
  })
}

export function isFullProgram(w: Workout): boolean {
  const planned = w.programSnapshot?.exercises
  return !!planned?.length && planned.every(p => {
    const e = w.exercises.find(e => e.id === p.id && e.exerciseDefinitionId === p.exerciseDefinitionId)
    return !!e && e.loadType === p.loadType && p.sets.length > 0 && p.sets.every(s => e.sets.some(a => a.templateSetId === s.id && valid(a, e) && (parseReps(a.actualRepsInput) ?? 0) >= (parseReps(s.repsInput) ?? Infinity) && (p.loadType === 'bodyweight' || (s.weightKg !== null && a.actualWeightKg !== null && (p.loadType === 'assisted' ? a.actualWeightKg <= s.weightKg : a.actualWeightKg >= s.weightKg)))))
  })
}

export function nextTrainingDate(days: number[], now: Date): Date | null {
  if (!days.some(d => Number.isInteger(d) && d >= 0 && d <= 6)) return null
  const date = new Date(now); date.setHours(12, 0, 0, 0)
  for (let i = 0; i < 7; i++) { if (days.includes(date.getDay())) return date; date.setDate(date.getDate() + 1) }
  return null
}

function contextFor(data: AppState, w: Workout): CoachContext {
  if (!completedCount(w)) return 'empty'
  if (w.coachFeedback?.wellbeing === 'symptoms' || w.coachFeedback?.wellbeing === 'fatigued' || w.startWellbeing === 'symptoms' || w.startWellbeing === 'fatigued') return 'care'
  if (w.coachFeedback?.context === 'returning') return 'returning'
  if (w.coachFeedback?.context === 'light') return 'light'
  const before = data.workouts.filter(x => x.id !== w.id && x.status === 'completed' && stamp(x) < stamp(w) && completedCount(x) > 0)
  if (w.coachFeedback?.context === 'time' || (w.programSnapshot && !isFullProgram(w))) return 'partial'
  if (!before.length) return 'first'
  const record = w.exercises.some(e => {
    const previous = before.flatMap(x => x.exercises.filter(p => p.exerciseDefinitionId === e.exerciseDefinitionId && p.loadType === e.loadType && p.equipmentSnapshot === e.equipmentSnapshot).flatMap(p => p.sets.filter(s => valid(s, p))))
    const current = e.sets.filter(s => valid(s, e))
    const value = (s: ActualSet) => e.loadType === 'bodyweight' ? parseReps(s.actualRepsInput) ?? 0 : s.actualWeightKg ?? 0
    return e.loadType !== 'assisted' && previous.length > 0 && current.length > 0 && Math.max(...current.map(value)) > Math.max(...previous.map(value))
  })
  if (record) return 'record'
  if (isFullProgram(w)) return 'full'
  return before.length >= 2 ? 'regular' : 'partial'
}

export function selectCoachPhrase(data: AppState, id: string): {id:string;text:string;art:'proud'|'record'|'support'|'treat'} {
  const w = data.workouts.find(w => w.id === id)
  const context = w ? contextFor(data, w) : 'empty'
  const tone = data.settings.coachTone ?? 'playful'
  const lines = coachCopy[context][tone]
  const prefix = `${context}:${tone}:`
  const old = w?.coachFeedback?.phraseId
  const previous = data.workouts.filter(x => x.id !== id && w && stamp(x) < stamp(w)).sort((a, b) => stamp(b) - stamp(a)).slice(0, 3).map(x => x.coachFeedback?.phraseId)
  const oldIndex = old?.startsWith(prefix) ? Number(old.slice(prefix.length)) : -1
  const index = oldIndex >= 0 && Number.isInteger(oldIndex) && oldIndex < lines.length ? oldIndex : Math.max(0, lines.findIndex((_, i) => !previous.includes(prefix + i)))
  const art = context === 'record' ? 'record' : ['care', 'returning', 'light', 'partial', 'empty'].includes(context) ? 'support' : context === 'full' && index % 2 === 0 ? 'treat' : 'proud'
  return { id: prefix + index, text: lines[index], art }
}
