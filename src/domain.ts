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
