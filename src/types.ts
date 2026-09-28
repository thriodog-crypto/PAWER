export type WeightUnit = 'kg' | 'lb'
export type LoadType = 'external' | 'bodyweight' | 'assisted'
export type SetStatus = 'pending' | 'completed' | 'skipped'

export interface ExerciseDefinition {
  id: string
  name: string
  category?: string
  notes?: string
  equipment?: string
  favorite?: boolean
  lastUsedAt?: string
  archived?: boolean
  imageDataUrl?: string
  imageName?: string
  imageScalePercent?: number
  imageOffsetXPercent?: number
  imageOffsetYPercent?: number
  createdAt: string
}

export interface PlannedSet {
  id: string
  weightInput: string
  weightKg: number | null
  repsInput: string
}

export interface ProgramExercise {
  id: string
  exerciseDefinitionId: string
  name: string
  unit: WeightUnit
  loadType: LoadType
  sets: PlannedSet[]
  restBetweenSec: number
  restAfterSec: number
  note: string
}

export interface Program {
  id: string
  name: string
  exercises: ProgramExercise[]
  createdAt: string
  updatedAt: string
}

export interface ActualSet extends PlannedSet {
  templateSetId: string
  actualWeightInput: string
  actualWeightKg: number | null
  actualRepsInput: string
  status: SetStatus
  completedAt?: string
}

export interface WorkoutExercise extends Omit<ProgramExercise, 'sets'> {
  sets: ActualSet[]
}

export interface RestTimer {
  kind: 'between' | 'after'
  durationSec: number
  endAt: number | null
  remainingSec: number
  paused: boolean
}

export interface Workout {
  id: string
  programId: string | null
  programName: string
  programSnapshot: Program | null
  exercises: WorkoutExercise[]
  status: 'active' | 'paused' | 'completed'
  currentExerciseIndex: number
  currentSetIndex: number
  startedAt: string
  finishedAt?: string
  timer: RestTimer | null
  awaitingNextExercise?: boolean
}

export interface BodyWeightEntry {
  id: string
  date: string
  valueKg: number
  note?: string
}

export interface MeasurementEntry {
  id: string
  date: string
  waistCm?: number
  chestCm?: number
  hipsCm?: number
  armCm?: number
  thighCm?: number
  fatPercent?: number
  fatMassKg?: number
  skeletalMuscleKg?: number
  waterValue?: number
  waterUnit?: 'l' | '%'
  custom?: { name: string; value: number; unit: string }[]
}

export interface ImportRecord {
  id: string
  fingerprint: string
  createdAt: string
  source: 'inbody-qr' | 'manual'
  rawType: 'url' | 'text' | 'image'
}

export interface Settings {
  bodyWeightGoalKg?: number
  sound: boolean
  vibration: boolean
  keepAwake: boolean
  characterImageDataUrl?: string
  characterImageName?: string
  characterScalePercent?: number
  characterOffsetXPercent?: number
  characterOffsetYPercent?: number
  wallpaperImageDataUrl?: string
  wallpaperImageName?: string
  wallpaperDimPercent?: number
  menuTransparencyPercent?: number
  accentColor?: string
  panelColor?: string
  onboardingDone?: boolean
  exerciseBackgroundDimPercent?: number
}

export interface AppState {
  version: 1
  definitions: ExerciseDefinition[]
  programs: Program[]
  workouts: Workout[]
  bodyWeights: BodyWeightEntry[]
  measurements: MeasurementEntry[]
  imports: ImportRecord[]
  settings: Settings
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
