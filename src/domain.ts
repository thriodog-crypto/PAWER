import type { ActualSet, AppState, LoadType, PlannedSet, Program, ProgramExercise, WeightUnit, Workout } from './types'

export const LB_TO_KG = 0.45359237

export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

export function parseDecimal(value: string): number | null {
  if (!value.trim()) return null
  const normalized = value.trim().replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function parseReps(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * LB_TO_KG
}

export function fromKg(valueKg: number, unit: WeightUnit): number {
  return unit === 'kg' ? valueKg : valueKg / LB_TO_KG
}

export function displayWeight(valueKg: number, unit: WeightUnit): string {
  const value = fromKg(valueKg, unit)
  return Number(value.toFixed(2)).toString().replace('.', ',')
}

export function makeSet(unit: WeightUnit, previous?: PlannedSet): PlannedSet {
  return {
    id: uid(),
    weightInput: previous?.weightInput ?? '',
    weightKg: previous?.weightKg ?? null,
    repsInput: previous?.repsInput ?? '',
  }
}

export function makeExercise(name = 'Новое упражнение'): ProgramExercise {
  const definitionId = uid()
  return {
    id: uid(),
    exerciseDefinitionId: definitionId,
    name,
    unit: 'kg',
    loadType: 'external',
    sets: [makeSet('kg'), makeSet('kg'), makeSet('kg')],
    restBetweenSec: 90,
    restAfterSec: 180,
    note: '',
  }
}

export function makeProgram(name = 'Новая программа'): Program {
  const now = new Date().toISOString()
  return { id: uid(), name, exercises: [], createdAt: now, updatedAt: now }
}

export function normalizeSet(set: PlannedSet, unit: WeightUnit): PlannedSet {
  const value = parseDecimal(set.weightInput)
  return { ...set, weightKg: value === null ? null : toKg(value, unit) }
}

export function switchExerciseUnit(exercise: ProgramExercise, nextUnit: WeightUnit): ProgramExercise {
  if (exercise.unit === nextUnit) return exercise
  return {
    ...exercise,
    unit: nextUnit,
    sets: exercise.sets.map(set => ({
      ...set,
      weightInput: set.weightKg === null ? '' : displayWeight(set.weightKg, nextUnit),
    })),
  }
}

export function startWorkout(program: Program | null, name = 'Свободная тренировка'): Workout {
  const snapshot = program ? structuredClone(program) : null
  return {
    id: uid(),
    programId: program?.id ?? null,
    programName: program?.name || name,
    programSnapshot: snapshot,
    exercises: (snapshot?.exercises ?? []).map(ex => ({
      ...ex,
      sets: ex.sets.map(set => ({
        ...set,
        weightInput: ex.loadType === 'bodyweight' ? '' : set.weightInput,
        weightKg: ex.loadType === 'bodyweight' ? null : set.weightKg,
        templateSetId: set.id,
        actualWeightInput: ex.loadType === 'bodyweight' ? '' : set.weightInput,
        actualWeightKg: ex.loadType === 'bodyweight' ? null : set.weightKg,
        actualRepsInput: set.repsInput,
        status: 'pending' as const,
      })),
    })),
    status: 'active',
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    startedAt: new Date().toISOString(),
    timer: null,
  }
}

export interface Comparison {
  kind: 'first' | 'same' | 'better' | 'worse' | 'mixed' | 'additional' | 'skipped'
  text: string
  weightDeltaKg?: number
  repsDelta?: number
}

export function compareSets(current: ActualSet, previous?: ActualSet, unit: WeightUnit = 'kg', loadType: LoadType = 'external'): Comparison {
  if (current.status === 'skipped') return { kind: 'skipped', text: 'Пропущен' }
  if (!previous || previous.status !== 'completed') return { kind: 'first', text: 'Первая запись' }
  const currentReps = parseReps(current.actualRepsInput)
  const previousReps = parseReps(previous.actualRepsInput)
  if (loadType === 'bodyweight') {
    if (currentReps === null || previousReps === null) return { kind: 'first', text: 'Нет сопоставимых данных' }
    const repsDelta = currentReps - previousReps
    if (repsDelta === 0) return { kind: 'same', text: 'Без изменений', repsDelta: 0 }
    return { kind: repsDelta > 0 ? 'better' : 'worse', text: `${repsDelta > 0 ? '+' : '−'}${Math.abs(repsDelta)} ${plural(repsDelta, 'повторение', 'повторения', 'повторений')} относительно прошлого раза`, repsDelta }
  }
  const currentWeight = current.actualWeightKg
  const previousWeight = previous.actualWeightKg
  if (currentWeight === null || previousWeight === null || currentReps === null || previousReps === null) {
    return { kind: 'first', text: 'Нет сопоставимых данных' }
  }
  const w = currentWeight - previousWeight
  const r = currentReps - previousReps
  const close = Math.abs(w) < 0.00001
  if (close && r === 0) return { kind: 'same', text: 'Без изменений', weightDeltaKg: 0, repsDelta: 0 }
  if (close) return { kind: r > 0 ? 'better' : 'worse', text: `${r > 0 ? '+' : '−'}${Math.abs(r)} ${plural(r, 'повторение', 'повторения', 'повторений')} относительно прошлого раза`, weightDeltaKg: 0, repsDelta: r }
  const shown = Math.abs(fromKg(w, unit))
  const formatted = Number(shown.toFixed(2)).toString().replace('.', ',')
  if (r === 0) return { kind: w > 0 ? 'better' : 'worse', text: `${w > 0 ? '+' : '−'}${formatted} ${unit} при тех же повторениях`, weightDeltaKg: w, repsDelta: 0 }
  return { kind: 'mixed', text: `${w > 0 ? '+' : '−'}${formatted} ${unit} и ${r > 0 ? '+' : '−'}${Math.abs(r)} ${plural(r, 'повторение', 'повторения', 'повторений')}`, weightDeltaKg: w, repsDelta: r }
}

function plural(n: number, one: string, few: string, many: string) {
  const value = Math.abs(n) % 100
  const mod = value % 10
  if (value > 10 && value < 20) return many
  if (mod > 1 && mod < 5) return few
  return mod === 1 ? one : many
}

export function workoutVolumeKg(workout: Workout): number {
  return workout.exercises.reduce((total, ex) => {
    if (ex.loadType !== 'external') return total
    return total + ex.sets.reduce((sum, set) => {
      const reps = parseReps(set.actualRepsInput)
      return set.status === 'completed' && set.actualWeightKg !== null && reps !== null ? sum + set.actualWeightKg * reps : sum
    }, 0)
  }, 0)
}

export interface TrainingSummary {
  workouts: number
  completedSets: number
  volumeKg: number
  trainedCategories: string[]
  latestWorkoutAt?: string
}

export function trainingSummary(state: AppState, days = 7, now = Date.now()): TrainingSummary {
  const cutoff = now - days * 86400000
  const workouts = state.workouts.filter(workout => workout.status === 'completed' && Date.parse(workout.finishedAt ?? workout.startedAt) >= cutoff)
  const trainedCategories = new Set<string>()
  workouts.forEach(workout => workout.exercises.forEach(exercise => {
    if (!exercise.sets.some(set => set.status === 'completed')) return
    const category = state.definitions.find(definition => definition.id === exercise.exerciseDefinitionId)?.category
    if (category) trainedCategories.add(category)
  }))
  return {
    workouts: workouts.length,
    completedSets: workouts.reduce((total, workout) => total + workout.exercises.reduce((sum, exercise) => sum + exercise.sets.filter(set => set.status === 'completed').length, 0), 0),
    volumeKg: workouts.reduce((total, workout) => total + workoutVolumeKg(workout), 0),
    trainedCategories: [...trainedCategories],
    latestWorkoutAt: workouts.slice().sort((a, b) => Date.parse(b.finishedAt ?? b.startedAt) - Date.parse(a.finishedAt ?? a.startedAt))[0]?.finishedAt,
  }
}

export interface CategoryActivity {
  category: string
  lastTrainedAt?: string
  daysAgo: number | null
}

export function categoryTrainingActivity(state: AppState, categories: readonly string[], now = Date.now()): CategoryActivity[] {
  return categories.map(category => {
    const timestamps = state.workouts.filter(workout => workout.status === 'completed').flatMap(workout => {
      const trained = workout.exercises.some(exercise => {
        const definition = state.definitions.find(item => item.id === exercise.exerciseDefinitionId)
        return definition?.category === category && exercise.sets.some(set => set.status === 'completed')
      })
      return trained ? [workout.finishedAt ?? workout.startedAt] : []
    })
    const lastTrainedAt = timestamps.sort((a, b) => Date.parse(b) - Date.parse(a))[0]
    return { category, lastTrainedAt, daysAgo: lastTrainedAt ? Math.max(0, Math.floor((now - Date.parse(lastTrainedAt)) / 86400000)) : null }
  })
}

export interface AchievementProgress {
  id: string
  title: string
  description: string
  icon: string
  progress: number
  target: number
  unlocked: boolean
  unlockedAt?: string
}

function maxWeekStreak(workouts: Workout[], minimumSessions: number): number {
  const counts = new Map<number, number>()
  workouts.forEach(workout => {
    const date = new Date(workout.finishedAt ?? workout.startedAt)
    const dayFromMonday = (date.getUTCDay() + 6) % 7
    date.setUTCHours(0, 0, 0, 0)
    date.setUTCDate(date.getUTCDate() - dayFromMonday)
    const week = date.getTime()
    counts.set(week, (counts.get(week) ?? 0) + 1)
  })
  const qualifying = [...counts.entries()].filter(([, count]) => count >= minimumSessions).map(([week]) => week).sort((a, b) => a - b)
  let best = 0; let current = 0; let previous: number | undefined
  qualifying.forEach(week => {
    current = previous !== undefined && week - previous === 7 * 86400000 ? current + 1 : 1
    best = Math.max(best, current); previous = week
  })
  return best
}

export function achievementCatalog(state: AppState): AchievementProgress[] {
  const workouts = state.workouts.filter(workout => workout.status === 'completed').slice().sort((a, b) => Date.parse(a.finishedAt ?? a.startedAt) - Date.parse(b.finishedAt ?? b.startedAt))
  const completedSets = workouts.reduce((total, workout) => total + workout.exercises.reduce((sum, exercise) => sum + exercise.sets.filter(set => set.status === 'completed').length, 0), 0)
  const perfectWorkouts = workouts.filter(workout => { const sets = workout.exercises.flatMap(exercise => exercise.sets); return sets.length > 0 && sets.every(set => set.status === 'completed') }).length
  const maxVolume = workouts.reduce((best, workout) => Math.max(best, workoutVolumeKg(workout)), 0)
  const previous = new Map<string, { weight: number | null; reps: number; sets: number }>()
  let weightUps = 0; let repsUps = 0; let setUps = 0; let maxWeightJump = 0
  workouts.forEach(workout => workout.exercises.forEach(exercise => {
    const completed = exercise.sets.filter(set => set.status === 'completed')
    if (!completed.length) return
    const weightValues = completed.map(set => set.actualWeightKg).filter((value): value is number => value !== null)
    const bestWeight = weightValues.length ? Math.max(...weightValues) : null
    const bestReps = Math.max(...completed.map(set => parseReps(set.actualRepsInput) ?? 0))
    const before = previous.get(exercise.exerciseDefinitionId)
    if (before) {
      if (bestWeight !== null && before.weight !== null && bestWeight > before.weight + .00001) { weightUps += 1; maxWeightJump = Math.max(maxWeightJump, bestWeight - before.weight) }
      if (bestReps > before.reps) repsUps += 1
      if (completed.length > before.sets) setUps += 1
    }
    previous.set(exercise.exerciseDefinitionId, { weight: bestWeight === null ? before?.weight ?? null : Math.max(before?.weight ?? 0, bestWeight), reps: Math.max(before?.reps ?? 0, bestReps), sets: Math.max(before?.sets ?? 0, completed.length) })
  }))
  const metrics = {
    workouts: workouts.length,
    completedSets,
    streak2: maxWeekStreak(workouts, 2),
    streak3: maxWeekStreak(workouts, 3),
    weightUps,
    repsUps,
    setUps,
    maxWeightJump,
    maxVolume,
    perfectWorkouts,
  }
  const definitions: Array<Omit<AchievementProgress, 'progress' | 'unlocked' | 'unlockedAt'> & { value: number }> = [
    { id: 'first_workout', icon: '🐾', title: 'Первый след', description: 'Заверши первую тренировку', value: metrics.workouts, target: 1 },
    { id: 'workouts_5', icon: '🔥', title: 'Разогнался', description: 'Заверши 5 тренировок', value: metrics.workouts, target: 5 },
    { id: 'workouts_10', icon: '⚡', title: 'Десятка силы', description: 'Заверши 10 тренировок', value: metrics.workouts, target: 10 },
    { id: 'workouts_25', icon: '🏅', title: 'Серьёзный настрой', description: 'Заверши 25 тренировок', value: metrics.workouts, target: 25 },
    { id: 'workouts_50', icon: '🏆', title: 'Полсотни', description: 'Заверши 50 тренировок', value: metrics.workouts, target: 50 },
    { id: 'sets_50', icon: '🔩', title: 'Рабочий режим', description: 'Выполни 50 подходов', value: metrics.completedSets, target: 50 },
    { id: 'sets_250', icon: '🦾', title: 'Стальная машина', description: 'Выполни 250 подходов', value: metrics.completedSets, target: 250 },
    { id: 'sets_1000', icon: '🤖', title: 'Тысяча подходов', description: 'Выполни 1000 подходов', value: metrics.completedSets, target: 1000 },
    { id: 'rhythm_2x2', icon: '📅', title: 'Вошёл в ритм', description: 'Минимум 2 тренировки в неделю 2 недели подряд', value: metrics.streak2, target: 2 },
    { id: 'rhythm_2x4', icon: '🗓️', title: 'Месяц постоянства', description: 'Минимум 2 тренировки в неделю 4 недели подряд', value: metrics.streak2, target: 4 },
    { id: 'rhythm_3x4', icon: '🚀', title: 'Не остановить', description: 'Минимум 3 тренировки в неделю 4 недели подряд', value: metrics.streak3, target: 4 },
    { id: 'weight_up_1', icon: '📈', title: 'Вес пошёл вверх', description: 'Впервые повысь лучший рабочий вес', value: metrics.weightUps, target: 1 },
    { id: 'weight_up_5', icon: '🏋️', title: 'Прогрессивная нагрузка', description: 'Улучши рабочий вес 5 раз', value: metrics.weightUps, target: 5 },
    { id: 'weight_jump_10', icon: '💥', title: 'Плюс десять', description: 'Подними рекорд упражнения сразу на 10 кг', value: metrics.maxWeightJump, target: 10 },
    { id: 'reps_up_1', icon: '➕', title: 'Ещё один!', description: 'Впервые повысь рекорд повторений', value: metrics.repsUps, target: 1 },
    { id: 'reps_up_5', icon: '🔁', title: 'Запас повторений', description: 'Повысь рекорд повторений 5 раз', value: metrics.repsUps, target: 5 },
    { id: 'sets_up_1', icon: '🧱', title: 'Добавил подход', description: 'Впервые выполни больше подходов в упражнении', value: metrics.setUps, target: 1 },
    { id: 'sets_up_5', icon: '🏗️', title: 'Строитель объёма', description: 'Добавь подходы к упражнениям 5 раз', value: metrics.setUps, target: 5 },
    { id: 'volume_1000', icon: '⚙️', title: 'Тонна за тренировку', description: 'Набери 1000 кг объёма за тренировку', value: metrics.maxVolume, target: 1000 },
    { id: 'volume_5000', icon: '🚂', title: 'Пять тонн', description: 'Набери 5000 кг объёма за тренировку', value: metrics.maxVolume, target: 5000 },
    { id: 'volume_10000', icon: '🛸', title: 'Десять тонн', description: 'Набери 10 000 кг объёма за тренировку', value: metrics.maxVolume, target: 10000 },
    { id: 'perfect_1', icon: '✨', title: 'Чистая работа', description: 'Заверши тренировку без пропусков', value: metrics.perfectWorkouts, target: 1 },
    { id: 'perfect_10', icon: '💎', title: 'Без компромиссов', description: 'Заверши 10 тренировок без пропусков', value: metrics.perfectWorkouts, target: 10 },
  ]
  const unlocks = new Map((state.achievements ?? []).map(item => [item.id, item.unlockedAt]))
  return definitions.map(definition => {
    const unlockedAt = unlocks.get(definition.id)
    return { id: definition.id, icon: definition.icon, title: definition.title, description: definition.description, progress: Math.min(definition.value, definition.target), target: definition.target, unlocked: definition.value >= definition.target || Boolean(unlockedAt), unlockedAt }
  })
}

export function syncAchievements(state: AppState, unlockedAt = new Date().toISOString()): string[] {
  state.achievements ??= []
  const known = new Set(state.achievements.map(item => item.id))
  const newlyUnlocked = achievementCatalog(state).filter(item => item.unlocked && !known.has(item.id))
  newlyUnlocked.forEach(item => state.achievements!.push({ id: item.id, unlockedAt }))
  return newlyUnlocked.map(item => item.id)
}

export function removeExerciseDefinition(state: AppState, definitionId: string): 'merged' | 'archived' | 'deleted' | 'missing' {
  const definition = state.definitions.find(item => item.id === definitionId)
  if (!definition) return 'missing'
  const normalizedName = definition.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru')
  const duplicate = state.definitions.find(item => item.id !== definitionId && !item.archived && item.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru') === normalizedName)
  const allExercises = [
    ...state.programs.flatMap(program => program.exercises),
    ...state.workouts.flatMap(workout => workout.exercises),
    ...state.workouts.flatMap(workout => workout.programSnapshot?.exercises ?? []),
  ]
  const references = allExercises.filter(exercise => exercise.exerciseDefinitionId === definitionId)
  if (duplicate) {
    duplicate.category ||= definition.category
    duplicate.notes ||= definition.notes
    duplicate.equipment ||= definition.equipment
    duplicate.favorite ||= definition.favorite
    duplicate.imageDataUrl ||= definition.imageDataUrl
    duplicate.imageName ||= definition.imageName
    duplicate.imageScalePercent ??= definition.imageScalePercent
    duplicate.imageOffsetXPercent ??= definition.imageOffsetXPercent
    duplicate.imageOffsetYPercent ??= definition.imageOffsetYPercent
    duplicate.imageFit ??= definition.imageFit
    if ((definition.lastUsedAt ?? '') > (duplicate.lastUsedAt ?? '')) duplicate.lastUsedAt = definition.lastUsedAt
    references.forEach(exercise => { exercise.exerciseDefinitionId = duplicate.id })
    state.definitions = state.definitions.filter(item => item.id !== definitionId)
    return 'merged'
  }
  if (references.length) {
    definition.archived = true
    return 'archived'
  }
  state.definitions = state.definitions.filter(item => item.id !== definitionId)
  return 'deleted'
}

export function previousWorkoutForExercise(state: AppState, workout: Workout, definitionId: string): Workout | undefined {
  const eligible = state.workouts
    .filter(item => item.id !== workout.id && item.status === 'completed' && item.exercises.some(ex => ex.exerciseDefinitionId === definitionId))
  const sameProgram = eligible.filter(item => item.programId === workout.programId)
  return (sameProgram.length ? sameProgram : eligible)
    .sort((a, b) => Date.parse(b.finishedAt ?? b.startedAt) - Date.parse(a.finishedAt ?? a.startedAt))[0]
}

export function nextPosition(workout: Workout, exerciseIndex: number, setIndex: number) {
  const exercise = workout.exercises[exerciseIndex]
  if (setIndex + 1 < exercise.sets.length) return { exerciseIndex, setIndex: setIndex + 1, restKind: 'between' as const, restSec: exercise.restBetweenSec }
  if (exerciseIndex + 1 < workout.exercises.length) return { exerciseIndex: exerciseIndex + 1, setIndex: 0, restKind: 'after' as const, restSec: exercise.restAfterSec }
  return null
}

export function continueFreeWorkout(workout: Workout, now = Date.now()) {
  const exercise = workout.exercises[workout.currentExerciseIndex]
  if (!exercise) return
  const restSec = exercise.restAfterSec
  workout.awaitingNextExercise = true
  workout.timer = restSec > 0
    ? { kind: 'after', durationSec: restSec, remainingSec: restSec, paused: false, endAt: now + restSec * 1000 }
    : null
}

export function timerRemaining(timer: { endAt: number | null; remainingSec: number; paused: boolean }, now = Date.now()) {
  if (timer.paused || timer.endAt === null) return Math.max(0, timer.remainingSec)
  return Math.max(0, Math.ceil((timer.endAt - now) / 1000))
}
