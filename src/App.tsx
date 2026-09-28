import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActualSet, AppState, BodyWeightEntry, ExerciseDefinition, LoadType, MeasurementEntry, Program, ProgramExercise, SaveStatus, WeightUnit, Workout } from './types'
import { backupJson, emptyState, loadState, parseBackup, saveState } from './storage'
import { compareSets, continueFreeWorkout, displayWeight, makeExercise, makeProgram, makeSet, nextPosition, normalizeSet, parseDecimal, parseReps, previousWorkoutForExercise, startWorkout, switchExerciseUnit, timerRemaining, toKg, uid, workoutVolumeKg } from './domain'

type Tab = 'home' | 'workouts' | 'progress' | 'profile'
type ProgressTab = 'strength' | 'body' | 'measurements'

const fmtDate = (value: string) => new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
const fmtTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
const weightUnitLabel = (unit: WeightUnit) => unit === 'kg' ? 'кг' : 'lb'
const setResultLabel = (exercise: Pick<ProgramExercise, 'loadType' | 'unit'>, weight: string, reps: string) => exercise.loadType === 'bodyweight' ? `Собственный вес × ${reps || '—'}` : `${weight || '—'} ${weightUnitLabel(exercise.unit)} × ${reps || '—'}`
const applyLoadType = (exercise: ProgramExercise | Workout['exercises'][number], loadType: LoadType) => {
  exercise.loadType = loadType
  if (loadType !== 'bodyweight') return
  exercise.sets.forEach(set => {
    set.weightInput = ''
    set.weightKg = null
    if ('actualWeightInput' in set && 'actualWeightKg' in set) {
      set.actualWeightInput = ''
      set.actualWeightKg = null
    }
  })
}
const clampNumber = (value: string, fallback = 0) => Math.max(0, Number.parseInt(value || `${fallback}`, 10) || 0)
const ACCENT_PRESETS = [
  { label: 'Мятный', value: '#2ef2a2' },
  { label: 'Голубой', value: '#38bdf8' },
  { label: 'Фиолетовый', value: '#a78bfa' },
  { label: 'Розовый', value: '#fb7185' },
  { label: 'Оранжевый', value: '#fb923c' },
]
const PANEL_PRESETS = [
  { label: 'Изумрудный', value: '#081714' },
  { label: 'Графитовый', value: '#17191f' },
  { label: 'Синий', value: '#0b1628' },
  { label: 'Фиолетовый', value: '#1a1230' },
  { label: 'Бордовый', value: '#241019' },
]
const EXERCISE_ZONES = [
  { value: 'chest', label: 'Грудь' },
  { value: 'back', label: 'Спина' },
  { value: 'shoulders', label: 'Плечи' },
  { value: 'legs', label: 'Ноги' },
  { value: 'arms', label: 'Руки' },
  { value: 'core', label: 'Пресс' },
] as const

function mixHex(from: string, to: string, amount: number): string {
  const read = (hex: string) => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16))
  const a = read(from); const b = read(to)
  return `#${a.map((value, i) => Math.round(value + (b[i] - value) * amount).toString(16).padStart(2, '0')).join('')}`
}

function accentTokens(value?: string) {
  const color = /^#[0-9a-f]{6}$/i.test(value ?? '') ? value! : '#fb7185'
  const rgb = [1, 3, 5].map(i => Number.parseInt(color.slice(i, i + 2), 16))
  const normalized = rgb.map(channel => channel / 255)
  const max = Math.max(...normalized); const min = Math.min(...normalized); const delta = max - min
  let hue = 0
  if (delta) {
    if (max === normalized[0]) hue = ((normalized[1] - normalized[2]) / delta) % 6
    else if (max === normalized[1]) hue = (normalized[2] - normalized[0]) / delta + 2
    else hue = (normalized[0] - normalized[1]) / delta + 4
    hue = (hue * 60 + 360) % 360
  }
  const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
  return { color, rgb: rgb.join(' '), hue, light: mixHex(color, '#ffffff', .22), dark: mixHex(color, '#000000', .22), contrast: luminance > .58 ? '#012019' : '#ffffff' }
}

function Icon({ name }: { name: 'home' | 'workout' | 'progress' | 'profile' }) {
  const paths = {
    home: <><path d="M4 11l8-7 8 7v9H5z"/><path d="M9 20v-6h6v6"/></>,
    workout: <><path d="M5 9v6m14-6v6M2 10v4m20-4v4M5 12h14"/></>,
    progress: <><path d="M4 19V9m6 10V5m6 14v-7m4 7V3"/></>,
    profile: <><circle cx="12" cy="8" r="4"/><path d="M4 21c.7-5 3.3-7 8-7s7.3 2 8 7"/></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function WolfArt({ compact = false, src }: { compact?: boolean; src?: string }) {
  const [missing, setMissing] = useState(false)
  useEffect(() => setMissing(false), [src])
  return <div className={`wolf-art ${compact ? 'compact' : ''}`} aria-label="Спортивный персонаж PAWER">
    {!missing && <img src={src || `${import.meta.env.BASE_URL}dogfit-character.png`} alt="Персонаж PAWER" onError={() => setMissing(true)} />}
    {missing && <div className="wolf-fallback"><span>PA</span><small>место для персонажа</small></div>}
  </div>
}

function SavePill({ status }: { status: SaveStatus }) {
  const labels: Record<SaveStatus, string> = { idle: '', saving: 'Сохраняется…', saved: 'Сохранено', error: 'Ошибка сохранения' }
  if (status === 'idle') return null
  return <span className={`save-pill ${status}`} aria-live="polite">{labels[status]}</span>
}

export default function App() {
  const [data, setData] = useState<AppState>(emptyState)
  const [ready, setReady] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [tab, setTab] = useState<Tab>('home')
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null)
  const [viewWorkoutId, setViewWorkoutId] = useState<string | null>(null)
  const [summaryWorkoutId, setSummaryWorkoutId] = useState<string | null>(null)
  const firstSave = useRef(true)

  useEffect(() => {
    loadState().then(setData).catch(() => setSaveStatus('error')).finally(() => setReady(true))
  }, [])

  useEffect(() => {
    if (!ready) return
    if (firstSave.current) { firstSave.current = false; return }
    setSaveStatus('saving')
    const timer = window.setTimeout(() => {
      saveState(data).then(() => setSaveStatus('saved')).catch(() => setSaveStatus('error'))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [data, ready])

  useEffect(() => {
    const root = document.documentElement
    const wallpaper = data.settings.wallpaperImageDataUrl
    const accent = accentTokens(data.settings.accentColor)
    const panel = accentTokens(data.settings.panelColor ?? '#17191f')
    const dim = Math.min(95, Math.max(0, data.settings.wallpaperDimPercent ?? 72)) / 100
    const transparency = Math.min(70, Math.max(0, data.settings.menuTransparencyPercent ?? 6)) / 100
    const characterScale = Math.min(200, Math.max(50, data.settings.characterScalePercent ?? 140)) / 100
    const characterX = Math.min(60, Math.max(-60, data.settings.characterOffsetXPercent ?? 20))
    const characterY = Math.min(60, Math.max(-60, data.settings.characterOffsetYPercent ?? 24))
    root.style.setProperty('--green', accent.color)
    root.style.setProperty('--green-dark', accent.dark)
    root.style.setProperty('--mint', accent.light)
    root.style.setProperty('--mint-soft', `rgb(${accent.rgb} / .11)`)
    root.style.setProperty('--line', `rgb(${accent.rgb} / .2)`)
    root.style.setProperty('--accent-rgb', accent.rgb)
    root.style.setProperty('--accent-light', accent.light)
    root.style.setProperty('--accent-dark', accent.dark)
    root.style.setProperty('--accent-contrast', accent.contrast)
    root.style.setProperty('--logo-hue-shift', `${accent.hue - 350}deg`)
    root.style.setProperty('--wallpaper-dim', `${dim}`)
    root.style.setProperty('--panel-alpha', `${1 - transparency}`)
    root.style.setProperty('--panel-rgb', panel.rgb)
    root.style.setProperty('--panel-light-rgb', accentTokens(mixHex(panel.color, '#ffffff', .06)).rgb)
    root.style.setProperty('--panel-dark-rgb', accentTokens(mixHex(panel.color, '#000000', .2)).rgb)
    root.style.setProperty('--panel-deep-rgb', accentTokens(mixHex(panel.color, '#000000', .34)).rgb)
    root.style.setProperty('--character-scale', `${characterScale}`)
    root.style.setProperty('--character-x', `${characterX}%`)
    root.style.setProperty('--character-y', `${characterY}%`)
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', accent.color)
    if (wallpaper) {
      document.body.style.setProperty('--user-wallpaper', `url(${wallpaper})`)
      document.body.classList.add('has-user-wallpaper')
    } else {
      document.body.style.removeProperty('--user-wallpaper')
      document.body.classList.remove('has-user-wallpaper')
    }
    return () => {
      document.body.style.removeProperty('--user-wallpaper')
      document.body.classList.remove('has-user-wallpaper')
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', '#030b0a')
      ;['--green', '--green-dark', '--mint', '--mint-soft', '--line', '--accent-rgb', '--accent-light', '--accent-dark', '--accent-contrast', '--logo-hue-shift', '--wallpaper-dim', '--panel-alpha', '--panel-rgb', '--panel-light-rgb', '--panel-dark-rgb', '--panel-deep-rgb', '--character-scale', '--character-x', '--character-y'].forEach(name => root.style.removeProperty(name))
    }
  }, [data.settings.wallpaperImageDataUrl, data.settings.wallpaperDimPercent, data.settings.menuTransparencyPercent, data.settings.accentColor, data.settings.panelColor, data.settings.characterScalePercent, data.settings.characterOffsetXPercent, data.settings.characterOffsetYPercent])

  const activeWorkout = data.workouts.find(w => w.status !== 'completed')
  const openWorkout = viewWorkoutId ? data.workouts.find(w => w.id === viewWorkoutId) : undefined
  const editingProgram = editingProgramId ? data.programs.find(p => p.id === editingProgramId) : undefined
  const summaryWorkout = summaryWorkoutId ? data.workouts.find(w => w.id === summaryWorkoutId) : undefined

  const update = (fn: (draft: AppState) => void) => setData(current => {
    const next = structuredClone(current)
    fn(next)
    return next
  })

  const start = (program: Program | null) => {
    const existing = data.workouts.find(w => w.status !== 'completed')
    if (existing) { setViewWorkoutId(existing.id); return }
    const workout = startWorkout(program)
    update(draft => {
      draft.workouts.unshift(workout)
    })
    setViewWorkoutId(workout.id)
  }

  const saveEditingProgram = async () => {
    setSaveStatus('saving')
    try {
      await saveState(data)
      setSaveStatus('saved')
      setEditingProgramId(null)
    } catch {
      setSaveStatus('error')
    }
  }

  if (!ready) return <main className="loading-screen"><div className="brand-mark">PA</div><p>Открываем журнал…</p></main>

  if (openWorkout && openWorkout.status !== 'completed') {
    return <WorkoutRunner data={data} workout={openWorkout} saveStatus={saveStatus} update={update} onClose={() => { setViewWorkoutId(null); setTab('home') }} onComplete={id => { setSummaryWorkoutId(id); setViewWorkoutId(null) }} />
  }

  if (editingProgram) {
    return <ProgramEditor data={data} program={editingProgram} saveStatus={saveStatus} update={update} onBack={() => setEditingProgramId(null)} onSave={saveEditingProgram} onStart={() => { start(editingProgram); setEditingProgramId(null) }} />
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="logo"><img className="header-logo" src={`${import.meta.env.BASE_URL}pawer-logo-transparent.png`} alt="PAWER" /></div>
      <SavePill status={saveStatus} />
    </header>

    <main className="page">
      {tab === 'home' && <Home data={data} activeWorkout={activeWorkout} onContinue={() => setViewWorkoutId(activeWorkout?.id ?? null)} onStart={start} onPrograms={() => setTab('workouts')} onEdit={setEditingProgramId} />}
      {tab === 'workouts' && <Workouts data={data} update={update} onEdit={setEditingProgramId} onStart={start} onOpenWorkout={id => setSummaryWorkoutId(id)} />}
      {tab === 'progress' && <Progress data={data} update={update} />}
      {tab === 'profile' && <Profile data={data} replaceData={setData} update={update} />}
    </main>

    <nav className="bottom-nav" aria-label="Основная навигация">
      {([['home', 'Главная', 'home'], ['workouts', 'Тренировки', 'workout'], ['progress', 'Прогресс', 'progress'], ['profile', 'Профиль', 'profile']] as const).map(([id, label, icon]) =>
        <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon name={icon} /><span>{label}</span></button>)}
    </nav>

    {summaryWorkout && <WorkoutSummary data={data} workout={summaryWorkout} update={update} onClose={() => setSummaryWorkoutId(null)} onDelete={() => update(draft => { draft.workouts = draft.workouts.filter(w => w.id !== summaryWorkout.id); setSummaryWorkoutId(null) })} onUpdateProgram={() => update(draft => updateProgramFromWorkout(draft, summaryWorkout))} />}
  </div>
}

function Home({ data, activeWorkout, onContinue, onStart, onPrograms, onEdit }: { data: AppState; activeWorkout?: Workout; onContinue: () => void; onStart: (program: Program | null) => void; onPrograms: () => void; onEdit: (id: string) => void }) {
  const latest = data.workouts.find(w => w.status === 'completed')
  return <>
    <section className="home-hero">
      <div className="hero-copy"><p className="eyebrow">Тренируйся в своём ритме</p><h1>{activeWorkout ? 'Тренировка ждёт продолжения' : 'Что сегодня в плане?'}</h1>
        {activeWorkout ? <button className="primary wide" onClick={onContinue}>Продолжить тренировку</button> : data.programs.length ? <button className="primary wide" onClick={() => onStart(data.programs[0])}>Начать «{data.programs[0].name}»</button> : <button className="primary wide" onClick={onPrograms}>Создать первую программу</button>}
      </div><WolfArt src={data.settings.characterImageDataUrl} />
    </section>

    <section className="quick-grid" aria-label="Быстрые действия">
      <button className="quick-card" onClick={() => onStart(null)}><span className="quick-icon">＋</span><strong>Свободная тренировка</strong><small>Добавляй по ходу</small></button>
      <button className="quick-card" onClick={onPrograms}><span className="quick-icon">≡</span><strong>Мои программы</strong><small>{data.programs.length || 'Пока нет'}</small></button>
    </section>

    <section className="section-head"><div><p className="eyebrow">Программы</p><h2>Быстрый старт</h2></div><button className="text-button" onClick={onPrograms}>Все</button></section>
    {data.programs.length ? <div className="card-stack">{data.programs.slice(0, 3).map(program => <article className="program-card" key={program.id}>
      <div><h3>{program.name}</h3><p>{program.exercises.length} упражнений · {program.exercises.reduce((n, e) => n + e.sets.length, 0)} подходов</p></div>
      <div className="card-actions"><button className="secondary" onClick={() => onEdit(program.id)}>Изменить</button><button className="primary icon-only" aria-label={`Начать ${program.name}`} onClick={() => onStart(program)}>→</button></div>
    </article>)}</div> : <Empty title="Программа начинается с твоих упражнений" text="Названия, веса и отдых — всё настраивается под тебя." action="Создать программу" onAction={onPrograms} />}

    {latest && <section className="latest-card"><div><p className="eyebrow">Последняя тренировка</p><h3>{latest.programName}</h3><p>{fmtDate(latest.finishedAt ?? latest.startedAt)} · {latest.exercises.reduce((n, e) => n + e.sets.filter(s => s.status === 'completed').length, 0)} подходов</p></div><span className="metric">{Math.round(workoutVolumeKg(latest)).toLocaleString('ru')}<small>кг объёма</small></span></section>}
  </>
}

function Workouts({ data, update, onEdit, onStart, onOpenWorkout }: { data: AppState; update: (fn: (draft: AppState) => void) => void; onEdit: (id: string) => void; onStart: (p: Program | null) => void; onOpenWorkout: (id: string) => void }) {
  const [section, setSection] = useState<'programs' | 'history'>('programs')
  const createProgram = () => update(draft => { const p = makeProgram(`Программа ${draft.programs.length + 1}`); draft.programs.push(p); onEdit(p.id) })
  const duplicate = (p: Program) => update(draft => { const copy = structuredClone(p); copy.id = uid(); copy.name = `${copy.name} — копия`; copy.createdAt = copy.updatedAt = new Date().toISOString(); copy.exercises.forEach(e => { e.id = uid(); e.sets.forEach(s => s.id = uid()) }); draft.programs.push(copy) })
  return <>
    <section className="page-title"><p className="eyebrow">Тренировки</p><h1>Программы и история</h1></section>
    <div className="segmented"><button className={section === 'programs' ? 'active' : ''} onClick={() => setSection('programs')}>Программы</button><button className={section === 'history' ? 'active' : ''} onClick={() => setSection('history')}>История</button></div>
    {section === 'programs' ? <>
      <button className="primary wide sticky-action" onClick={createProgram}>＋ Новая программа</button>
      {data.programs.length ? <div className="card-stack">{data.programs.map(p => <article className="program-detail-card" key={p.id}>
        <div><h2>{p.name}</h2><p>{p.exercises.length ? p.exercises.map(e => e.name).join(' · ') : 'Добавь упражнения'}</p></div>
        <button className="primary wide" disabled={!p.exercises.length} onClick={() => onStart(p)}>Начать тренировку</button>
        <div className="inline-actions"><button onClick={() => onEdit(p.id)}>Редактировать</button><button onClick={() => duplicate(p)}>Копировать</button><button className="danger-text" onClick={() => { if (confirm(`Удалить программу «${p.name}»? История тренировок сохранится.`)) update(d => { d.programs = d.programs.filter(x => x.id !== p.id) }) }}>Удалить</button></div>
      </article>)}</div> : <Empty title="Собери первую программу" text="Добавь любые упражнения и плановые подходы." />}
    </> : <History data={data} onOpen={onOpenWorkout} />}
  </>
}

function History({ data, onOpen }: { data: AppState; onOpen: (id: string) => void }) {
  const items = data.workouts.filter(w => w.status === 'completed').sort((a, b) => Date.parse(b.finishedAt ?? b.startedAt) - Date.parse(a.finishedAt ?? a.startedAt))
  if (!items.length) return <Empty title="История пока пустая" text="Завершённые тренировки появятся здесь." />
  return <div className="timeline">{items.map(w => <button className="history-card" key={w.id} onClick={() => onOpen(w.id)}>
    <span className="date-chip"><strong>{new Date(w.startedAt).getDate()}</strong><small>{new Intl.DateTimeFormat('ru', { month: 'short' }).format(new Date(w.startedAt))}</small></span>
    <span className="history-main"><strong>{w.programName}</strong><small>{w.exercises.filter(e => e.sets.some(s => s.status === 'completed')).length} упражнений · {w.exercises.reduce((n, e) => n + e.sets.filter(s => s.status === 'completed').length, 0)} подходов</small></span>
    <span>›</span>
  </button>)}</div>
}

function ProgramEditor({ data, program, saveStatus, update, onBack, onSave, onStart }: { data: AppState; program: Program; saveStatus: SaveStatus; update: (fn: (draft: AppState) => void) => void; onBack: () => void; onSave: () => void; onStart: () => void }) {
  const edit = (fn: (p: Program, draft: AppState) => void) => update(draft => { const p = draft.programs.find(x => x.id === program.id); if (p) { fn(p, draft); p.updatedAt = new Date().toISOString() } })
  const addNew = () => edit((p, draft) => { const ex = makeExercise(`Упражнение ${p.exercises.length + 1}`); p.exercises.push(ex); draft.definitions.push({ id: ex.exerciseDefinitionId, name: ex.name, createdAt: new Date().toISOString() }) })
  const addExisting = (def: ExerciseDefinition) => edit(p => { const ex = makeExercise(def.name); ex.exerciseDefinitionId = def.id; p.exercises.push(ex) })
  const move = (index: number, delta: number) => edit(p => { const target = index + delta; if (target < 0 || target >= p.exercises.length) return; [p.exercises[index], p.exercises[target]] = [p.exercises[target], p.exercises[index]] })
  return <div className="editor-shell">
    <header className="editor-header"><button className="back-button" onClick={onBack}>‹</button><div><small>Редактор программы</small><input className="title-input" aria-label="Название программы" value={program.name} onChange={e => edit(p => { p.name = e.target.value })} onBlur={() => { if (!program.name.trim()) edit(p => { p.name = 'Тренировка без названия' }) }} /></div><SavePill status={saveStatus} /></header>
    <main className="editor-content">
      {program.exercises.map((exercise, index) => <ExerciseEditor key={exercise.id} exercise={exercise} zone={data.definitions.find(d => d.id === exercise.exerciseDefinitionId)?.category} index={index} total={program.exercises.length} onEdit={fn => edit((p, draft) => { const ex = p.exercises.find(x => x.id === exercise.id); if (ex) { fn(ex); const def = draft.definitions.find(d => d.id === ex.exerciseDefinitionId); if (def) def.name = ex.name } })} onZone={zone => edit((_p, draft) => { const def = draft.definitions.find(d => d.id === exercise.exerciseDefinitionId); if (def) def.category = zone || undefined })} onMove={delta => move(index, delta)} onDelete={() => edit(p => { p.exercises = p.exercises.filter(e => e.id !== exercise.id) })} />)}
      <button className="add-exercise" onClick={addNew}>＋ <span><strong>Добавить новое упражнение</strong><small>Свободное название, любые подходы</small></span></button>
      {!!data.definitions.filter(d => !program.exercises.some(e => e.exerciseDefinitionId === d.id)).length && <section className="suggestions"><h3>Из истории упражнений</h3><div>{data.definitions.filter(d => !program.exercises.some(e => e.exerciseDefinitionId === d.id)).slice(0, 8).map(d => <button key={d.id} onClick={() => addExisting(d)}>＋ {d.name}</button>)}</div></section>}
      <p className="local-note">Программа сохраняется автоматически на этом устройстве.</p>
    </main>
    <footer className="editor-footer">
      <button className="secondary wide" onClick={onSave}>Сохранить</button>
      <button className="primary wide" disabled={!program.exercises.length || program.exercises.some(e => !e.name.trim())} onClick={onStart}>Начать тренировку</button>
    </footer>
  </div>
}

function ExerciseEditor({ exercise, zone, index, total, onEdit, onZone, onMove, onDelete }: { exercise: ProgramExercise; zone?: string; index: number; total: number; onEdit: (fn: (e: ProgramExercise) => void) => void; onZone: (zone: string) => void; onMove: (delta: number) => void; onDelete: () => void }) {
  const automaticName = `Упражнение ${index + 1}`
  const weightLabel = exercise.loadType === 'assisted' ? 'Помощь' : exercise.loadType === 'bodyweight' ? 'Доп. вес' : 'Вес'
  const updateSet = (id: string, key: 'weightInput' | 'repsInput', value: string) => onEdit(ex => { const set = ex.sets.find(s => s.id === id); if (!set) return; if (key === 'repsInput') set.repsInput = value.replace(/\D/g, ''); else { set.weightInput = value; Object.assign(set, normalizeSet(set, ex.unit)) } })
  const changeUnit = (unit: WeightUnit) => onEdit(ex => Object.assign(ex, switchExerciseUnit(ex, unit)))
  return <article className="exercise-card">
    <div className="exercise-heading"><span className="number-badge">{index + 1}</span><input className="exercise-name" aria-label={`Название упражнения ${index + 1}`} value={exercise.name} placeholder={automaticName} onFocus={() => { if (/^Упражнение \d+$/.test(exercise.name)) onEdit(ex => { ex.name = '' }) }} onChange={e => onEdit(ex => { ex.name = e.target.value })} onBlur={() => { if (!exercise.name.trim()) onEdit(ex => { ex.name = automaticName }) }} /><button className="more-button" aria-label="Удалить упражнение" onClick={() => { if (confirm(`Удалить «${exercise.name}» из программы?`)) onDelete() }}>×</button></div>
    <div className={`exercise-options ${exercise.loadType === 'bodyweight' ? 'bodyweight-options' : ''}`}>
      <label>Тип нагрузки<select value={exercise.loadType} onChange={e => onEdit(ex => applyLoadType(ex, e.target.value as LoadType))}><option value="external">С отягощением</option><option value="bodyweight">Собственный вес</option><option value="assisted">С противовесом</option></select></label>
      {exercise.loadType !== 'bodyweight' && <label>Единица<select value={exercise.unit} onChange={e => changeUnit(e.target.value as WeightUnit)}><option value="kg">кг</option><option value="lb">lb</option></select></label>}
      <label>Зона<select value={zone ?? ''} onChange={e => onZone(e.target.value)}><option value="">Без зоны</option>{EXERCISE_ZONES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    </div>
    {exercise.loadType === 'bodyweight' && <p className="bodyweight-hint">Собственный вес — укажи только количество повторений.</p>}
    <div className={`sets-table ${exercise.loadType === 'bodyweight' ? 'bodyweight-sets' : ''}`}><div className="sets-head"><span>Подход</span>{exercise.loadType !== 'bodyweight' && <span>{weightLabel}, {weightUnitLabel(exercise.unit)}</span>}<span>Повторы</span><span></span></div>
      {exercise.sets.map((set, i) => <div className="set-row" key={set.id}><strong>{i + 1}</strong>{exercise.loadType !== 'bodyweight' && <input inputMode="decimal" aria-label={`${weightLabel}, подход ${i + 1}`} placeholder="—" value={set.weightInput} onChange={e => updateSet(set.id, 'weightInput', e.target.value)} />}<input inputMode="numeric" aria-label={`Повторения, подход ${i + 1}`} placeholder="—" value={set.repsInput} onChange={e => updateSet(set.id, 'repsInput', e.target.value)} /><button aria-label={`Удалить подход ${i + 1}`} disabled={exercise.sets.length === 1} onClick={() => onEdit(ex => { ex.sets = ex.sets.filter(s => s.id !== set.id) })}>×</button></div>)}
    </div>
    <div className="set-actions"><button onClick={() => onEdit(ex => { const next = makeSet(ex.unit, ex.sets.at(-1)); if (ex.loadType === 'bodyweight') { next.weightInput = ''; next.weightKg = null } ex.sets.push(next) })}>＋ Подход</button>{exercise.loadType !== 'bodyweight' && <button onClick={() => { const value = exercise.sets[0]?.weightInput; if (value !== undefined) onEdit(ex => { ex.sets = ex.sets.map(s => normalizeSet({ ...s, weightInput: value }, ex.unit)) }) }}>Применить первый вес ко всем</button>}</div>
    <div className="rest-grid"><label>Между подходами, сек<input inputMode="numeric" value={exercise.restBetweenSec} onChange={e => onEdit(ex => { ex.restBetweenSec = clampNumber(e.target.value) })} /></label><label>После упражнения, сек<input inputMode="numeric" value={exercise.restAfterSec} onChange={e => onEdit(ex => { ex.restAfterSec = clampNumber(e.target.value) })} /></label></div>
    <label className="note-field">Заметка<input value={exercise.note} placeholder="Необязательно" onChange={e => onEdit(ex => { ex.note = e.target.value })} /></label>
    <div className="reorder-row"><button disabled={index === 0} onClick={() => onMove(-1)}>↑ Выше</button><button disabled={index === total - 1} onClick={() => onMove(1)}>↓ Ниже</button></div>
  </article>
}

function WorkoutRunner({ data, workout, saveStatus, update, onClose, onComplete }: { data: AppState; workout: Workout; saveStatus: SaveStatus; update: (fn: (draft: AppState) => void) => void; onClose: () => void; onComplete: (id: string) => void }) {
  const [remaining, setRemaining] = useState(() => workout.timer ? timerRemaining(workout.timer) : 0)
  const [showList, setShowList] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [dismissedNextPicker, setDismissedNextPicker] = useState(false)
  const [editingPast, setEditingPast] = useState<{ exercise: number; set: number } | null>(null)
  const completionLock = useRef(false)
  const exercise = workout.exercises[workout.currentExerciseIndex]
  const set = exercise?.sets[workout.currentSetIndex]

  useEffect(() => {
    if (!workout.timer) { setRemaining(0); return }
    const refresh = () => {
      const left = timerRemaining(workout.timer!)
      setRemaining(left)
      if (left <= 0 && !workout.timer?.paused) update(draft => { const w = draft.workouts.find(x => x.id === workout.id); if (w?.timer && timerRemaining(w.timer) <= 0) w.timer = null })
    }
    refresh()
    const id = window.setInterval(refresh, 500)
    const visible = () => refresh()
    document.addEventListener('visibilitychange', visible)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', visible) }
  }, [workout.id, workout.timer?.endAt, workout.timer?.paused, workout.timer?.remainingSec])

  const addPicker = (showAdd || (workout.awaitingNextExercise && !workout.timer && !dismissedNextPicker)) && <ExercisePicker mode="add" definitions={data.definitions} currentDefinitionId="" onClose={() => { setShowAdd(false); setDismissedNextPicker(true) }} onSelect={definition => { update(d => appendExerciseToWorkout(d, workout.id, definition)); setShowAdd(false); setDismissedNextPicker(false) }} onCreate={(name, category) => { update(d => { const definition: ExerciseDefinition = { id: uid(), name, category, createdAt: new Date().toISOString() }; d.definitions.push(definition); appendExerciseToWorkout(d, workout.id, definition) }); setShowAdd(false); setDismissedNextPicker(false) }} />

  if (!exercise || !set) {
    return <div className="workout-shell"><header className="runner-header"><button className="back-button" onClick={onClose}>×</button><strong>{workout.programName}</strong><SavePill status={saveStatus} /></header><main className="runner-empty"><h1>Добавь первое упражнение</h1><p>Свободная тренировка началась пустой. Добавь упражнение, чтобы записывать подходы.</p><button className="primary wide" onClick={() => setShowAdd(true)}>＋ Добавить упражнение</button><button className="secondary wide" onClick={() => finishWorkout(update, workout.id, onComplete)}>Завершить без подходов</button></main>{addPicker}</div>
  }

  const previousWorkout = previousWorkoutForExercise(data, workout, exercise.exerciseDefinitionId)
  const previousExercise = previousWorkout?.exercises.find(e => e.exerciseDefinitionId === exercise.exerciseDefinitionId)
  const previousSet = previousExercise?.sets.find(s => s.templateSetId === set.templateSetId)
  const valid = parseReps(set.actualRepsInput) !== null && (exercise.loadType === 'bodyweight' || set.actualWeightKg !== null)
  const allSetsResolved = workout.exercises.every(item => item.sets.every(itemSet => itemSet.status !== 'pending'))
  const freeExerciseComplete = workout.programId === null && allSetsResolved && workout.currentExerciseIndex === workout.exercises.length - 1
  const restAfterMinutes = Math.max(0, Math.round(exercise.restAfterSec / 60))

  const editActual = (key: 'actualWeightInput' | 'actualRepsInput', value: string, position = { exercise: workout.currentExerciseIndex, set: workout.currentSetIndex }) => update(draft => {
    const w = draft.workouts.find(x => x.id === workout.id); const ex = w?.exercises[position.exercise]; const target = ex?.sets[position.set]; if (!target || !ex) return
    if (key === 'actualRepsInput') target.actualRepsInput = value.replace(/\D/g, '')
    else { target.actualWeightInput = value; const parsed = parseDecimal(value); target.actualWeightKg = parsed === null ? null : toKg(parsed, ex.unit) }
  })

  const confirmSet = () => {
    if (!valid || completionLock.current || set.status === 'completed') return
    completionLock.current = true
    update(draft => {
      const w = draft.workouts.find(x => x.id === workout.id); if (!w) return
      const target = w.exercises[w.currentExerciseIndex]?.sets[w.currentSetIndex]; if (!target || target.status === 'completed') return
      target.status = 'completed'; target.completedAt = new Date().toISOString()
      advanceWorkout(w, true)
    })
    window.setTimeout(() => { completionLock.current = false }, 450)
  }

  const skipSet = () => update(draft => {
    const w = draft.workouts.find(x => x.id === workout.id); if (!w) return
    const target = w.exercises[w.currentExerciseIndex]?.sets[w.currentSetIndex]; if (!target) return
    target.status = 'skipped'; advanceWorkout(w, true)
  })

  const skipExercise = () => update(draft => {
    const w = draft.workouts.find(x => x.id === workout.id); if (!w) return
    const ex = w.exercises[w.currentExerciseIndex]
    ex.sets.forEach(s => { if (s.status === 'pending') s.status = 'skipped' })
    const nextEx = w.currentExerciseIndex + 1
    w.timer = null
    if (nextEx < w.exercises.length) { w.currentExerciseIndex = nextEx; w.currentSetIndex = 0 }
  })

  const toggleWorkoutPause = () => update(draft => {
    const w = draft.workouts.find(x => x.id === workout.id); if (!w) return
    if (w.status === 'paused') {
      w.status = 'active'
      if (w.timer?.paused) { w.timer.paused = false; w.timer.endAt = Date.now() + w.timer.remainingSec * 1000 }
    } else {
      w.status = 'paused'
      if (w.timer && !w.timer.paused) { w.timer.remainingSec = timerRemaining(w.timer); w.timer.paused = true; w.timer.endAt = null }
    }
  })

  return <div className="workout-shell">
    <header className="runner-header"><button className="back-button" aria-label="На главную" onClick={onClose}>‹</button><div><small>{workout.programName}</small><strong>Тренировка</strong></div><SavePill status={saveStatus} /></header>
    <div className="workout-progress"><span style={{ width: `${workoutProgress(workout)}%` }} /></div>
    <main className="runner-content">
      {workout.status === 'paused' ? <section className="workout-paused"><span>Ⅱ</span><h1>Тренировка на паузе</h1><p>Подходы и таймер остановлены. Можно спокойно вернуться позже — состояние сохранено.</p><button className="primary wide" onClick={toggleWorkoutPause}>Продолжить тренировку</button></section> : workout.timer ? <RestScreen workout={workout} remaining={remaining} update={update} /> : freeExerciseComplete ? <section className="workout-continue"><span>✓</span><p className="eyebrow">Упражнение выполнено</p><h1>{exercise.name}</h1><p>{workout.awaitingNextExercise ? 'Отдых завершён. Теперь выбери следующее упражнение.' : restAfterMinutes > 0 ? `Продолжим после ${restAfterMinutes} мин отдыха — затем выберешь следующее упражнение.` : 'Выбери следующее упражнение и продолжай тренировку.'}</p><button className="primary wide" onClick={() => { if (workout.awaitingNextExercise) setDismissedNextPicker(false); else update(d => { const w = d.workouts.find(x => x.id === workout.id); if (w) continueFreeWorkout(w) }) }}>{workout.awaitingNextExercise ? 'Выбрать следующее упражнение' : 'Продолжить тренировку'}</button></section> : <>
        <section className="runner-title"><div><p className="eyebrow">Упражнение {workout.currentExerciseIndex + 1} из {workout.exercises.length}</p><h1>{exercise.name}</h1>{exercise.note && <p>{exercise.note}</p>}</div><button className="list-button" onClick={() => setShowList(true)}>Список</button></section>
        <section className="set-focus"><div className="set-counter"><span>Подход</span><strong>{workout.currentSetIndex + 1}</strong><span>из {exercise.sets.length}</span></div>
          <div className="plan-line">План: <strong>{setResultLabel(exercise, set.weightInput, set.repsInput)}</strong></div>
          <div className="previous-line">{previousSet?.status === 'completed' ? <>В прошлый раз: <strong>{setResultLabel(exercise, previousSet.actualWeightInput, previousSet.actualRepsInput)}</strong>{previousWorkout?.programId !== workout.programId && <small> · {previousWorkout?.programName}, {fmtDate(previousWorkout!.startedAt)}</small>}</> : 'Первая запись'}</div>
        </section>
        <section className="actual-panel"><div className="actual-panel-heading"><h2>Сейчас</h2><label>Тип нагрузки<select value={exercise.loadType} onChange={e => update(draft => { const ex = draft.workouts.find(x => x.id === workout.id)?.exercises[workout.currentExerciseIndex]; if (ex) applyLoadType(ex, e.target.value as LoadType) })}><option value="external">С отягощением</option><option value="bodyweight">Собственный вес</option><option value="assisted">С противовесом</option></select></label></div>{exercise.loadType === 'bodyweight' && <p className="bodyweight-hint runner-bodyweight-hint">Вес вводить не нужно — запиши только повторения.</p>}<div className={`actual-inputs ${exercise.loadType === 'bodyweight' ? 'bodyweight-inputs' : ''}`}>
          {exercise.loadType !== 'bodyweight' && <><label><span>{exercise.loadType === 'assisted' ? 'Помощь' : 'Вес'}, {weightUnitLabel(exercise.unit)}</span><input inputMode="decimal" value={set.actualWeightInput} placeholder="—" onChange={e => editActual('actualWeightInput', e.target.value)} /></label><span className="multiply">×</span></>}<label><span>Повторения</span><input inputMode="numeric" value={set.actualRepsInput} placeholder="—" onChange={e => editActual('actualRepsInput', e.target.value)} /></label>
        </div>{!valid && <p className="field-error">Заполни корректные фактические значения.</p>}</section>
        <div className="runner-links"><button onClick={skipSet}>Пропустить подход</button><button onClick={skipExercise}>Пропустить упражнение</button></div>
        <div className="runner-secondary-actions">
          <button className="secondary replace-workout-exercise" aria-label="Поменять упражнение" onClick={() => setShowReplace(true)}>⇄ Поменять</button>
          <button className="secondary add-workout-exercise" aria-label="Добавить упражнение" onClick={() => setShowAdd(true)}>＋ Добавить упражнение</button>
        </div>
        <button className="complete-set" disabled={!valid || set.status === 'completed'} onClick={confirmSet}>{set.status === 'completed' ? '✓ Подход выполнен' : '✓ Выполнил подход'}</button>
      </>}
    </main>
    <footer className="runner-footer"><button onClick={toggleWorkoutPause}>{workout.status === 'paused' ? 'Продолжить тренировку' : 'Пауза тренировки'}</button><button className="danger-text" onClick={() => { if (allSetsResolved || confirm('Завершить тренировку и сохранить выполненную часть?')) finishWorkout(update, workout.id, onComplete) }}>Завершить</button></footer>
    {showList && <WorkoutList workout={workout} update={update} onClose={() => setShowList(false)} onAdd={() => { setShowList(false); setShowAdd(true) }} onSelect={(exerciseIndex, setIndex) => update(d => { const w = d.workouts.find(x => x.id === workout.id); if (w) { w.currentExerciseIndex = exerciseIndex; w.currentSetIndex = setIndex; w.timer = null } })} onEdit={setEditingPast} />}
    {showReplace && <ExercisePicker definitions={data.definitions} currentDefinitionId={exercise.exerciseDefinitionId} onClose={() => setShowReplace(false)} onSelect={definition => { if (exercise.sets.some(item => item.status !== 'pending') && !confirm('Заменить упражнение и удалить уже отмеченные в нём подходы?')) return; update(d => replaceExerciseInWorkout(d, workout.id, workout.currentExerciseIndex, definition)); setShowReplace(false) }} onCreate={(name, category) => { if (exercise.sets.some(item => item.status !== 'pending') && !confirm('Заменить упражнение и удалить уже отмеченные в нём подходы?')) return; update(d => { const definition: ExerciseDefinition = { id: uid(), name, category, createdAt: new Date().toISOString() }; d.definitions.push(definition); replaceExerciseInWorkout(d, workout.id, workout.currentExerciseIndex, definition) }); setShowReplace(false) }} />}
    {addPicker}
    {editingPast && <EditPastSet workout={workout} position={editingPast} onEdit={editActual} update={update} onClose={() => setEditingPast(null)} />}
  </div>
}

function ExercisePicker({ definitions, currentDefinitionId, onClose, onSelect, onCreate, mode = 'replace' }: { definitions: ExerciseDefinition[]; currentDefinitionId: string; onClose: () => void; onSelect: (definition: ExerciseDefinition) => void; onCreate: (name: string, category?: string) => void; mode?: 'replace' | 'add' }) {
  const [query, setQuery] = useState('')
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase('ru')
  const available = definitions
    .filter(definition => definition.id !== currentDefinitionId && (!normalizedQuery || definition.name.toLocaleLowerCase('ru').includes(normalizedQuery)))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const sections = [...EXERCISE_ZONES, { value: '', label: 'Без зоны' }]
  const create = () => {
    const name = newName.trim()
    if (!name) return
    onCreate(name, newCategory || undefined)
  }
  return <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label={mode === 'add' ? 'Следующее упражнение' : 'Поменять упражнение'}><div className="sheet exercise-picker"><div className="sheet-head"><div><small>Текущая тренировка</small><h2>{mode === 'add' ? 'Следующее упражнение' : 'Поменять упражнение'}</h2></div><button aria-label="Закрыть" onClick={onClose}>×</button></div>
    <label className="picker-search">Найти среди ранее добавленных<input autoFocus value={query} placeholder="Название упражнения" onChange={event => setQuery(event.target.value)} /></label>
    <div className="sheet-scroll exercise-groups">{sections.map(section => {
      const items = available.filter(definition => section.value ? definition.category === section.value : !EXERCISE_ZONES.some(zone => zone.value === definition.category))
      if (!items.length) return null
      return <section className={`exercise-group ${section.value ? '' : 'unassigned'}`} key={section.value || 'unassigned'}><h3>{section.label}</h3><div>{items.map(definition => <button className="exercise-choice" key={definition.id} onClick={() => onSelect(definition)}><span>{definition.name}</span><strong>Выбрать</strong></button>)}</div></section>
    })}{!available.length && <p className="picker-empty">Подходящих сохранённых упражнений нет.</p>}</div>
    <section className="picker-create"><h3>Или добавить новое</h3><input value={newName} placeholder="Название упражнения" onChange={event => setNewName(event.target.value)} /><select aria-label="Зона нового упражнения" value={newCategory} onChange={event => setNewCategory(event.target.value)}><option value="">Без зоны</option>{EXERCISE_ZONES.map(zone => <option key={zone.value} value={zone.value}>{zone.label}</option>)}</select><button className="primary wide" disabled={!newName.trim()} onClick={create}>Создать и выбрать</button></section>
  </div></div>
}

function RestScreen({ workout, remaining, update }: { workout: Workout; remaining: number; update: (fn: (draft: AppState) => void) => void }) {
  const timer = workout.timer!
  const ex = workout.exercises[workout.currentExerciseIndex]
  const set = ex?.sets[workout.currentSetIndex]
  const mutate = (fn: (w: Workout) => void) => update(d => { const w = d.workouts.find(x => x.id === workout.id); if (w) fn(w) })
  const togglePause = () => mutate(w => {
    if (!w.timer) return
    if (w.timer.paused) { w.timer.paused = false; w.timer.endAt = Date.now() + w.timer.remainingSec * 1000 }
    else { w.timer.remainingSec = timerRemaining(w.timer); w.timer.paused = true; w.timer.endAt = null }
  })
  return <section className="rest-screen"><p className="eyebrow">{timer.kind === 'between' ? 'Отдых между подходами' : 'Отдых после упражнения'}</p><div className="timer-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52"/><circle className="timer-progress" cx="60" cy="60" r="52" style={{ strokeDashoffset: 327 - 327 * Math.min(1, remaining / Math.max(1, timer.durationSec)) }} /></svg><strong>{fmtTime(remaining)}</strong></div>
    <div className="next-card"><small>Дальше</small>{workout.awaitingNextExercise ? <><strong>Следующее упражнение</strong><span>Выберешь его после отдыха</span></> : <><strong>{ex?.name}</strong><span>Подход {workout.currentSetIndex + 1}: {ex && set ? setResultLabel(ex, set.actualWeightInput || set.weightInput, set.actualRepsInput || set.repsInput) : '—'}</span></>}</div>
    <div className="timer-actions"><button className="primary" onClick={() => mutate(w => { w.timer = null })}>Пропустить отдых</button><button className="secondary" onClick={() => mutate(w => { if (!w.timer) return; if (w.timer.paused) w.timer.remainingSec += 30; else if (w.timer.endAt) w.timer.endAt += 30000 })}>＋30 секунд</button><button className="secondary" onClick={togglePause}>{timer.paused ? 'Продолжить' : 'Пауза'}</button></div>
    <p className="timer-note">Следующий подход не отметится автоматически.</p>
  </section>
}

function WorkoutList({ workout, update, onClose, onAdd, onSelect, onEdit }: { workout: Workout; update: (fn: (draft: AppState) => void) => void; onClose: () => void; onAdd: () => void; onSelect: (e: number, s: number) => void; onEdit: (position: { exercise: number; set: number }) => void }) {
  const addSet = (exerciseId: string) => update(d => { const w = d.workouts.find(x => x.id === workout.id); const ex = w?.exercises.find(x => x.id === exerciseId); if (!ex) return; const planned = makeSet(ex.unit, ex.sets.at(-1)); if (ex.loadType === 'bodyweight') { planned.weightInput = ''; planned.weightKg = null } ex.sets.push({ ...planned, templateSetId: planned.id, actualWeightInput: planned.weightInput, actualWeightKg: planned.weightKg, actualRepsInput: planned.repsInput, status: 'pending' }) })
  const moveExercise = (index: number, delta: number) => update(d => { const w = d.workouts.find(x => x.id === workout.id); if (!w) return; const target = index + delta; if (target < w.currentExerciseIndex || target >= w.exercises.length) return; const currentId = w.exercises[w.currentExerciseIndex]?.id; [w.exercises[index], w.exercises[target]] = [w.exercises[target], w.exercises[index]]; w.currentExerciseIndex = Math.max(0, w.exercises.findIndex(x => x.id === currentId)) })
  return <div className="sheet-backdrop" role="dialog" aria-modal="true"><div className="sheet"><div className="sheet-head"><h2>Все упражнения</h2><button onClick={onClose}>×</button></div>
    <div className="sheet-scroll">{workout.exercises.map((ex, ei) => <section className="workout-list-ex" key={ex.id}><div className="workout-list-heading"><span><strong>{ex.name}</strong><small>{ex.sets.filter(s => s.status === 'completed').length} из {ex.sets.length} выполнено</small></span><span className="workout-order"><button disabled={ei <= workout.currentExerciseIndex} onClick={() => moveExercise(ei, -1)}>↑</button><button disabled={ei < workout.currentExerciseIndex || ei === workout.exercises.length - 1} onClick={() => moveExercise(ei, 1)}>↓</button></span></div>{ex.sets.map((s, si) => <div className={`workout-list-set ${s.status}`} key={s.id}><span>{si + 1}</span><span>{setResultLabel(ex, s.actualWeightInput, s.actualRepsInput)}</span><span>{s.status === 'completed' ? '✓' : s.status === 'skipped' ? 'Пропущен' : 'Ожидает'}</span>{s.status === 'completed' ? <button onClick={() => onEdit({ exercise: ei, set: si })}>Исправить</button> : <button onClick={() => { onSelect(ei, si); onClose() }}>Перейти</button>}</div>)}<button className="add-list-set" onClick={() => addSet(ex.id)}>＋ Дополнительный подход</button></section>)}</div>
    <button className="secondary wide" onClick={onAdd}>＋ Добавить упражнение</button></div></div>
}

function EditPastSet({ workout, position, onEdit, update, onClose }: { workout: Workout; position: { exercise: number; set: number }; onEdit: (key: 'actualWeightInput' | 'actualRepsInput', value: string, position: { exercise: number; set: number }) => void; update: (fn: (draft: AppState) => void) => void; onClose: () => void }) {
  const ex = workout.exercises[position.exercise]; const set = ex.sets[position.set]
  return <div className="sheet-backdrop" role="dialog" aria-modal="true"><div className="sheet small"><div className="sheet-head"><div><small>Исправление подхода</small><h2>{ex.name}</h2></div><button onClick={onClose}>×</button></div>{ex.loadType === 'bodyweight' && <p className="bodyweight-hint">Собственный вес — вес вводить не нужно.</p>}<div className={`actual-inputs ${ex.loadType === 'bodyweight' ? 'bodyweight-inputs' : ''}`}>{ex.loadType !== 'bodyweight' && <><label><span>{ex.loadType === 'assisted' ? 'Помощь' : 'Вес'}, {weightUnitLabel(ex.unit)}</span><input inputMode="decimal" value={set.actualWeightInput} onChange={e => onEdit('actualWeightInput', e.target.value, position)} /></label><span className="multiply">×</span></>}<label><span>Повторения</span><input inputMode="numeric" value={set.actualRepsInput} onChange={e => onEdit('actualRepsInput', e.target.value, position)} /></label></div><p className="local-note">Текущий отдых не будет перезапущен.</p><button className="primary wide" onClick={onClose}>Готово</button><button className="text-button wide" onClick={() => { update(d => { const w = d.workouts.find(x => x.id === workout.id); const target = w?.exercises[position.exercise]?.sets[position.set]; if (target) target.status = 'skipped' }); onClose() }}>Отметить пропущенным</button></div></div>
}

function advanceWorkout(workout: Workout, startRest: boolean) {
  const fromExercise = workout.currentExerciseIndex
  const fromSet = workout.currentSetIndex
  const next = nextPosition(workout, fromExercise, fromSet)
  if (!next) { workout.timer = null; return }
  workout.currentExerciseIndex = next.exerciseIndex
  workout.currentSetIndex = next.setIndex
  if (startRest && next.restSec > 0) workout.timer = { kind: next.restKind, durationSec: next.restSec, remainingSec: next.restSec, paused: false, endAt: Date.now() + next.restSec * 1000 }
  else workout.timer = null
}

function workoutExerciseForDefinition(state: AppState, definition: ExerciseDefinition): Workout['exercises'][number] {
  const programSource = state.programs.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).flatMap(program => program.exercises).find(exercise => exercise.exerciseDefinitionId === definition.id)
  const historySource = state.workouts.filter(workout => workout.status === 'completed').slice().sort((a, b) => Date.parse(b.finishedAt ?? b.startedAt) - Date.parse(a.finishedAt ?? a.startedAt)).flatMap(workout => workout.exercises).find(exercise => exercise.exerciseDefinitionId === definition.id)
  const source = programSource ?? historySource
  const base = source ?? makeExercise(definition.name)
  const sourceSets: Array<ProgramExercise['sets'][number] | ActualSet> = base.sets
  const sets = sourceSets.map(sourceSet => {
    const isActual = 'status' in sourceSet
    const actualSource = isActual && sourceSet.status === 'completed'
    const weightInput = base.loadType === 'bodyweight' ? '' : programSource ? sourceSet.weightInput : actualSource ? sourceSet.actualWeightInput : sourceSet.weightInput
    const weightKg = base.loadType === 'bodyweight' ? null : programSource ? sourceSet.weightKg : actualSource ? sourceSet.actualWeightKg : sourceSet.weightKg
    const repsInput = programSource ? sourceSet.repsInput : actualSource ? sourceSet.actualRepsInput : sourceSet.repsInput
    const templateSetId = isActual ? sourceSet.templateSetId : sourceSet.id
    return { id: uid(), templateSetId, weightInput, weightKg, repsInput, actualWeightInput: weightInput, actualWeightKg: weightKg, actualRepsInput: repsInput, status: 'pending' as const }
  })
  return { id: uid(), exerciseDefinitionId: definition.id, name: definition.name, unit: base.unit, loadType: base.loadType, sets, restBetweenSec: base.restBetweenSec, restAfterSec: base.restAfterSec, note: base.note }
}

function appendExerciseToWorkout(state: AppState, workoutId: string, definition: ExerciseDefinition) {
  const workout = state.workouts.find(item => item.id === workoutId)
  if (!workout) return
  workout.exercises.push(workoutExerciseForDefinition(state, definition))
  workout.currentExerciseIndex = workout.exercises.length - 1
  workout.currentSetIndex = 0
  workout.awaitingNextExercise = false
  workout.timer = null
}

function replaceExerciseInWorkout(state: AppState, workoutId: string, exerciseIndex: number, definition: ExerciseDefinition) {
  const workout = state.workouts.find(item => item.id === workoutId)
  if (!workout || !workout.exercises[exerciseIndex]) return
  workout.exercises[exerciseIndex] = workoutExerciseForDefinition(state, definition)
  workout.currentExerciseIndex = exerciseIndex
  workout.currentSetIndex = 0
  workout.timer = null
}

function workoutProgress(w: Workout) {
  const all = w.exercises.reduce((n, e) => n + e.sets.length, 0)
  const done = w.exercises.reduce((n, e) => n + e.sets.filter(s => s.status !== 'pending').length, 0)
  return all ? Math.round(done / all * 100) : 0
}

function finishWorkout(update: (fn: (draft: AppState) => void) => void, id: string, onComplete: (id: string) => void) {
  update(draft => { const w = draft.workouts.find(x => x.id === id); if (w) { w.status = 'completed'; w.finishedAt = new Date().toISOString(); w.timer = null; w.awaitingNextExercise = false } })
  onComplete(id)
}

function Progress({ data, update }: { data: AppState; update: (fn: (draft: AppState) => void) => void }) {
  const [section, setSection] = useState<ProgressTab>('strength')
  return <>
    <section className="page-title"><p className="eyebrow">Прогресс</p><h1>Результаты без догадок</h1></section>
    <div className="segmented three"><button className={section === 'strength' ? 'active' : ''} onClick={() => setSection('strength')}>Силовые</button><button className={section === 'body' ? 'active' : ''} onClick={() => setSection('body')}>Вес тела</button><button className={section === 'measurements' ? 'active' : ''} onClick={() => setSection('measurements')}>Замеры</button></div>
    {section === 'strength' && <StrengthProgress data={data} />}
    {section === 'body' && <BodyProgress data={data} update={update} />}
    {section === 'measurements' && <Measurements data={data} update={update} />}
  </>
}

function StrengthProgress({ data }: { data: AppState }) {
  const usedDefinitions = data.definitions.filter(def => data.workouts.some(w => w.status === 'completed' && w.exercises.some(e => e.exerciseDefinitionId === def.id)))
  const [definitionId, setDefinitionId] = useState(usedDefinitions[0]?.id ?? '')
  const [metric, setMetric] = useState<'weight' | 'reps' | 'volume'>('weight')
  const [period, setPeriod] = useState<'1m' | '3m' | '6m' | '1y' | 'all'>('3m')
  const cutoffDays = { '1m': 31, '3m': 93, '6m': 186, '1y': 366, all: Infinity }[period]
  const points = data.workouts.filter(w => w.status === 'completed' && Date.now() - Date.parse(w.finishedAt ?? w.startedAt) <= cutoffDays * 86400000).flatMap(w => {
    const ex = w.exercises.find(e => e.exerciseDefinitionId === definitionId); if (!ex) return []
    const completed = ex.sets.filter(s => s.status === 'completed')
    if (!completed.length) return []
    let value = 0; let detail = ''
    if (metric === 'weight') { const max = completed.reduce<ActualSet | undefined>((best, s) => s.actualWeightKg !== null && (!best || (best.actualWeightKg ?? -1) < s.actualWeightKg) ? s : best, undefined); if (!max?.actualWeightKg) return []; value = max.actualWeightKg; detail = `${max.actualRepsInput} повт.` }
    if (metric === 'reps') { value = Math.max(...completed.map(s => parseReps(s.actualRepsInput) ?? 0)); detail = 'лучший подход' }
    if (metric === 'volume') { value = ex.loadType === 'external' ? completed.reduce((sum, s) => sum + (s.actualWeightKg ?? 0) * (parseReps(s.actualRepsInput) ?? 0), 0) : 0; detail = 'объём упражнения' }
    return [{ date: w.finishedAt ?? w.startedAt, value, detail }]
  }).sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  const definition = data.definitions.find(d => d.id === definitionId)
  return <section className="progress-panel">
    {usedDefinitions.length ? <><label className="select-field">Упражнение<select value={definitionId} onChange={e => setDefinitionId(e.target.value)}>{usedDefinitions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <div className="choice-row"><button className={metric === 'weight' ? 'active' : ''} onClick={() => setMetric('weight')}>Макс. вес</button><button className={metric === 'reps' ? 'active' : ''} onClick={() => setMetric('reps')}>Повторения</button><button className={metric === 'volume' ? 'active' : ''} onClick={() => setMetric('volume')}>Объём</button></div>
      <Chart points={points} unit={metric === 'weight' || metric === 'volume' ? 'кг' : 'повт.'} label={metric === 'weight' ? 'Максимальный выполненный вес за тренировку' : metric === 'volume' ? 'Объём упражнения' : 'Максимум повторений в подходе'} />
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="records"><h3>Записи: {definition?.name}</h3>{points.slice().reverse().map((p, i) => <div key={`${p.date}-${i}`}><span>{fmtDate(p.date)}</span><strong>{Number(p.value.toFixed(1)).toLocaleString('ru')} {metric === 'weight' || metric === 'volume' ? 'кг' : ''}</strong><small>{p.detail}</small></div>)}</div>
    </> : <Empty title="Нет силовых данных" text="Выбери своё упражнение после первой завершённой тренировки." />}
  </section>
}

function Chart({ points, unit, label }: { points: { date: string; value: number; detail?: string }[]; unit: string; label: string }) {
  if (!points.length) return <div className="chart-empty"><strong>Пока нет данных</strong><span>График появится из сохранённых записей.</span></div>
  const values = points.map(p => p.value); const min = Math.min(...values); const max = Math.max(...values); const range = max - min || 1
  const coords = points.map((p, i) => ({ x: points.length === 1 ? 50 : 7 + i * 86 / (points.length - 1), y: 82 - (p.value - min) / range * 60, ...p }))
  return <div className="chart-card"><div className="chart-label"><span>{label}</span><strong>{Number(points.at(-1)!.value.toFixed(1)).toLocaleString('ru')} {unit}</strong></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={label}><path className="grid-line" d="M5 22H95M5 52H95M5 82H95"/>{points.length > 1 && <polyline points={coords.map(p => `${p.x},${p.y}`).join(' ')} />}{coords.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.8"><title>{fmtDate(p.date)}: {Number(p.value.toFixed(1))} {unit}{p.detail ? `, ${p.detail}` : ''}</title></circle>)}</svg><div className="chart-dates"><span>{fmtDate(points[0].date)}</span>{points.length > 1 && <span>{fmtDate(points.at(-1)!.date)}</span>}</div></div>
}

function PeriodPicker<T extends string>({ value, onChange }: { value: T; onChange: (value: T) => void }) {
  const options = [['1m', 'М'], ['3m', '3М'], ['6m', '6М'], ['1y', 'Год'], ['all', 'Всё']] as const
  return <div className="period-picker">{options.map(([id, label]) => <button key={id} className={value === id ? 'active' : ''} onClick={() => onChange(id as T)}>{label}</button>)}</div>
}

function BodyProgress({ data, update }: { data: AppState; update: (fn: (draft: AppState) => void) => void }) {
  const [value, setValue] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [period, setPeriod] = useState<'1m' | '3m' | '6m' | '1y' | 'all'>('3m')
  const sorted = data.bodyWeights.slice().sort((a, b) => a.date.localeCompare(b.date))
  const cutoffDays = { '1m': 31, '3m': 93, '6m': 186, '1y': 366, all: Infinity }[period]
  const filtered = sorted.filter(x => Date.now() - Date.parse(x.date) <= cutoffDays * 86400000)
  const current = sorted.at(-1); const delta = filtered.length > 1 ? filtered.at(-1)!.valueKg - filtered[0].valueKg : null
  const save = () => { const parsed = parseDecimal(value); if (parsed === null || !date) return; update(d => d.bodyWeights.push({ id: uid(), date: new Date(`${date}T12:00:00`).toISOString(), valueKg: parsed, note: note.trim() || undefined })); setValue(''); setNote('') }
  return <section className="progress-panel"><div className="body-summary"><div><small>Текущий вес</small><strong>{current ? `${current.valueKg.toLocaleString('ru')} кг` : '—'}</strong><span>{delta === null ? 'Недостаточно данных' : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta).toLocaleString('ru')} кг за период`}</span></div><label>Цель, кг<input inputMode="decimal" value={data.settings.bodyWeightGoalKg ?? ''} placeholder="Не задана" onChange={e => { const v = parseDecimal(e.target.value); update(d => { d.settings.bodyWeightGoalKg = v ?? undefined }) }} /></label></div>
    <div className="quick-add"><h2>Добавить вес</h2><div><label>Вес, кг<input inputMode="decimal" value={value} placeholder="82,4" onChange={e => setValue(e.target.value)} /></label><label>Дата<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label></div><label>Заметка<input value={note} placeholder="Необязательно" onChange={e => setNote(e.target.value)} /></label><button className="primary wide" disabled={parseDecimal(value) === null || !date} onClick={save}>Сохранить вес</button></div>
    <Chart points={filtered.map(x => ({ date: x.date, value: x.valueKg }))} unit="кг" label="Вес тела" /><PeriodPicker value={period} onChange={setPeriod} />
    <div className="records"><h3>Записи веса</h3>{sorted.slice().reverse().map(entry => <div key={entry.id}><span>{fmtDate(entry.date)}</span><strong>{entry.valueKg.toLocaleString('ru')} кг</strong><small>{entry.note}</small><button aria-label="Удалить запись" onClick={() => { if (confirm('Удалить эту запись веса?')) update(d => { d.bodyWeights = d.bodyWeights.filter(x => x.id !== entry.id) }) }}>×</button></div>)}</div>
  </section>
}

function Measurements({ data, update }: { data: AppState; update: (fn: (draft: AppState) => void) => void }) {
  const emptyForm = { date: new Date().toISOString().slice(0, 10), waist: '', chest: '', hips: '', arm: '', thigh: '', fat: '', fatMass: '', muscle: '', water: '', waterUnit: '%' as 'l' | '%', customName: '', customValue: '', customUnit: 'см' }
  const [form, setForm] = useState(emptyForm)
  const fields = [{ key: 'waist', label: 'Талия, см' }, { key: 'chest', label: 'Грудь, см' }, { key: 'hips', label: 'Бёдра, см' }, { key: 'arm', label: 'Плечо, см' }, { key: 'thigh', label: 'Бедро, см' }] as const
  const composition = [{ key: 'fat', label: 'Жир, %' }, { key: 'fatMass', label: 'Жировая масса, кг' }, { key: 'muscle', label: 'Скелетные мышцы, кг' }] as const
  const set = (key: keyof typeof form, value: string) => setForm(f => ({ ...f, [key]: value }))
  const hasValues = [...fields, ...composition].some(({ key }) => parseDecimal(form[key]) !== null) || parseDecimal(form.water) !== null || (!!form.customName.trim() && parseDecimal(form.customValue) !== null)
  const save = () => { if (!hasValues || !form.date) return; const n = (v: string) => parseDecimal(v) ?? undefined; update(d => d.measurements.push({ id: uid(), date: new Date(`${form.date}T12:00:00`).toISOString(), waistCm: n(form.waist), chestCm: n(form.chest), hipsCm: n(form.hips), armCm: n(form.arm), thighCm: n(form.thigh), fatPercent: n(form.fat), fatMassKg: n(form.fatMass), skeletalMuscleKg: n(form.muscle), waterValue: n(form.water), waterUnit: n(form.water) === undefined ? undefined : form.waterUnit, custom: form.customName.trim() && n(form.customValue) !== undefined ? [{ name: form.customName.trim(), value: n(form.customValue)!, unit: form.customUnit }] : undefined })); setForm(emptyForm) }
  return <section className="progress-panel"><div className="quick-add measurement-form"><h2>Новый замер</h2><label>Дата<input type="date" value={form.date} onChange={e => set('date', e.target.value)} /></label><h3>Обхваты</h3><div className="measure-grid">{fields.map(({ key, label }) => <label key={key}>{label}<input inputMode="decimal" value={form[key]} placeholder="—" onChange={e => set(key, e.target.value)} /></label>)}</div><h3>Состав тела</h3><div className="measure-grid">{composition.map(({ key, label }) => <label key={key}>{label}<input inputMode="decimal" value={form[key]} placeholder="—" onChange={e => set(key, e.target.value)} /></label>)}<label>Вода<input inputMode="decimal" value={form.water} placeholder="—" onChange={e => set('water', e.target.value)} /></label><label>Единица воды<select value={form.waterUnit} onChange={e => setForm(f => ({ ...f, waterUnit: e.target.value as 'l' | '%' }))}><option value="%">%</option><option value="l">литры</option></select></label></div><h3>Свой показатель</h3><div className="custom-measure"><input value={form.customName} placeholder="Название" onChange={e => set('customName', e.target.value)} /><input inputMode="decimal" value={form.customValue} placeholder="Значение" onChange={e => set('customValue', e.target.value)} /><input value={form.customUnit} placeholder="Единица" onChange={e => set('customUnit', e.target.value)} /></div><button className="primary wide" disabled={!hasValues} onClick={save}>Сохранить замер</button></div>
    <div className="records"><h3>История замеров</h3>{data.measurements.length ? data.measurements.slice().sort((a, b) => b.date.localeCompare(a.date)).map(entry => <MeasurementRow key={entry.id} entry={entry} onDelete={() => update(d => { d.measurements = d.measurements.filter(x => x.id !== entry.id) })} />) : <p>Добавляй только те показатели, которые действительно измерил.</p>}</div>
  </section>
}

function MeasurementRow({ entry, onDelete }: { entry: MeasurementEntry; onDelete: () => void }) {
  const values = [entry.waistCm !== undefined && `Талия ${entry.waistCm} см`, entry.chestCm !== undefined && `Грудь ${entry.chestCm} см`, entry.hipsCm !== undefined && `Бёдра ${entry.hipsCm} см`, entry.armCm !== undefined && `Плечо ${entry.armCm} см`, entry.thighCm !== undefined && `Бедро ${entry.thighCm} см`, entry.fatPercent !== undefined && `Жир ${entry.fatPercent}%`, entry.fatMassKg !== undefined && `Жировая масса ${entry.fatMassKg} кг`, entry.skeletalMuscleKg !== undefined && `Скелетные мышцы ${entry.skeletalMuscleKg} кг`, entry.waterValue !== undefined && `Вода ${entry.waterValue} ${entry.waterUnit}`, ...(entry.custom?.map(x => `${x.name} ${x.value} ${x.unit}`) ?? [])].filter(Boolean)
  return <div className="measurement-row"><span>{fmtDate(entry.date)}</span><strong>{values.join(' · ')}</strong><button onClick={() => { if (confirm('Удалить замер?')) onDelete() }}>×</button></div>
}

function Profile({ data, replaceData, update }: { data: AppState; replaceData: (state: AppState) => void; update: (fn: (draft: AppState) => void) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const characterRef = useRef<HTMLInputElement>(null)
  const wallpaperRef = useRef<HTMLInputElement>(null)
  const downloadBackup = () => {
    const blob = new Blob([backupJson(data)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `dogfit-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url)
  }
  const restore = async (file?: File) => {
    if (!file) return
    try { const state = parseBackup(await file.text()); if (confirm('Заменить текущие данные содержимым резервной копии?')) replaceData(state) } catch (error) { alert(error instanceof Error ? error.message : 'Не удалось прочитать копию') } finally { if (fileRef.current) fileRef.current.value = '' }
  }
  const saveAppearanceImage = async (kind: 'character' | 'wallpaper', file?: File) => {
    if (!file) return
    const input = kind === 'character' ? characterRef.current : wallpaperRef.current
    try {
      if (kind === 'character' && file.type !== 'image/png') throw new Error('Для персонажа выбери файл PNG.')
      if (!file.type.startsWith('image/')) throw new Error('Выбери файл изображения.')
      const maxBytes = kind === 'character' ? 8 * 1024 * 1024 : 12 * 1024 * 1024
      if (file.size > maxBytes) throw new Error(`Файл слишком большой. Максимум ${kind === 'character' ? '8' : '12'} МБ.`)
      const dataUrl = await fileToDataUrl(file)
      update(d => {
        if (kind === 'character') {
          d.settings.characterImageDataUrl = dataUrl
          d.settings.characterImageName = file.name
        } else {
          d.settings.wallpaperImageDataUrl = dataUrl
          d.settings.wallpaperImageName = file.name
        }
      })
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Не удалось загрузить изображение')
    } finally {
      if (input) input.value = ''
    }
  }
  return <>
    <section className="page-title"><p className="eyebrow">Профиль</p><h1>Данные и настройки</h1></section>
    <section className="device-banner"><span>⌁</span><div><strong>Данные хранятся на этом устройстве</strong><p>Это не облачная синхронизация. Регулярно сохраняй резервную копию.</p></div></section>
    <section className="settings-card appearance-card"><h2>Оформление</h2><p>Персонаж и обои сохраняются только на этом устройстве.</p>
      <div className="appearance-grid">
        <div className="appearance-item"><div className="appearance-preview character"><img src={data.settings.characterImageDataUrl || `${import.meta.env.BASE_URL}dogfit-character.png`} alt="Текущий персонаж" /></div><div><strong>Персонаж</strong><small>{data.settings.characterImageName || 'Стандартный персонаж PAWER'}</small></div><button className="secondary wide" onClick={() => characterRef.current?.click()}>Выбрать PNG</button>{data.settings.characterImageDataUrl && <button className="text-button danger-text" onClick={() => update(d => { delete d.settings.characterImageDataUrl; delete d.settings.characterImageName })}>Вернуть стандартного</button>}<input ref={characterRef} hidden type="file" accept="image/png,.png" onChange={e => saveAppearanceImage('character', e.target.files?.[0])} /></div>
        <div className="appearance-item"><div className={`appearance-preview wallpaper ${data.settings.wallpaperImageDataUrl ? '' : 'empty'}`} style={data.settings.wallpaperImageDataUrl ? { backgroundImage: `url(${data.settings.wallpaperImageDataUrl})` } : undefined}>{!data.settings.wallpaperImageDataUrl && <span>▧</span>}</div><div><strong>Обои</strong><small>{data.settings.wallpaperImageName || 'Без изображения'}</small></div><button className="secondary wide" onClick={() => wallpaperRef.current?.click()}>Выбрать обои</button>{data.settings.wallpaperImageDataUrl && <button className="text-button danger-text" onClick={() => update(d => { delete d.settings.wallpaperImageDataUrl; delete d.settings.wallpaperImageName })}>Убрать обои</button>}<input ref={wallpaperRef} hidden type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" onChange={e => saveAppearanceImage('wallpaper', e.target.files?.[0])} /></div>
      </div>
      <div className="appearance-controls">
        <label><span>Размер персонажа <output>{data.settings.characterScalePercent ?? 140}%</output></span><input type="range" min="50" max="200" step="5" value={data.settings.characterScalePercent ?? 140} onChange={e => update(d => { d.settings.characterScalePercent = Number(e.target.value) })} /></label>
        <label><span>Положение: влево / вправо <output>{data.settings.characterOffsetXPercent ?? 20}%</output></span><input type="range" min="-60" max="60" step="2" value={data.settings.characterOffsetXPercent ?? 20} onChange={e => update(d => { d.settings.characterOffsetXPercent = Number(e.target.value) })} /></label>
        <label><span>Положение: вверх / вниз <output>{data.settings.characterOffsetYPercent ?? 24}%</output></span><input type="range" min="-60" max="60" step="2" value={data.settings.characterOffsetYPercent ?? 24} onChange={e => update(d => { d.settings.characterOffsetYPercent = Number(e.target.value) })} /></label>
        <button className="secondary wide appearance-reset" onClick={() => update(d => { delete d.settings.characterScalePercent; delete d.settings.characterOffsetXPercent; delete d.settings.characterOffsetYPercent })}>Вернуть положение как в референсе</button>
        <label className={!data.settings.wallpaperImageDataUrl ? 'disabled' : ''}><span>Затемнение обоев <output>{data.settings.wallpaperDimPercent ?? 72}%</output></span><input type="range" min="0" max="95" step="1" disabled={!data.settings.wallpaperImageDataUrl} value={data.settings.wallpaperDimPercent ?? 72} onChange={e => update(d => { d.settings.wallpaperDimPercent = Number(e.target.value) })} /></label>
        <label><span>Прозрачность карточек и меню <output>{data.settings.menuTransparencyPercent ?? 6}%</output></span><input type="range" min="0" max="70" step="1" value={data.settings.menuTransparencyPercent ?? 6} onChange={e => update(d => { d.settings.menuTransparencyPercent = Number(e.target.value) })} /></label>
        <div className="accent-setting"><div><strong>Цвет интерфейса</strong><small>Кнопки, обводки и активные элементы</small></div><div className="accent-swatches">{ACCENT_PRESETS.map(preset => <button key={preset.value} type="button" aria-label={preset.label} aria-pressed={(data.settings.accentColor ?? '#fb7185').toLowerCase() === preset.value} className={(data.settings.accentColor ?? '#fb7185').toLowerCase() === preset.value ? 'active' : ''} style={{ backgroundColor: preset.value }} onClick={() => update(d => { d.settings.accentColor = preset.value })} />)}<label className="custom-color" title="Свой цвет"><span>＋</span><input type="color" aria-label="Выбрать свой цвет интерфейса" value={data.settings.accentColor ?? '#fb7185'} onChange={e => update(d => { d.settings.accentColor = e.target.value })} /></label></div></div>
        <div className="accent-setting"><div><strong>Цвет фона карточек и меню</strong><small>Меняет оттенок окон отдельно от кнопок</small></div><div className="accent-swatches">{PANEL_PRESETS.map(preset => <button key={preset.value} type="button" aria-label={preset.label} aria-pressed={(data.settings.panelColor ?? '#17191f').toLowerCase() === preset.value} className={(data.settings.panelColor ?? '#17191f').toLowerCase() === preset.value ? 'active' : ''} style={{ backgroundColor: preset.value }} onClick={() => update(d => { d.settings.panelColor = preset.value })} />)}<label className="custom-color" title="Свой цвет фона"><span>＋</span><input type="color" aria-label="Выбрать свой цвет фона карточек и меню" value={data.settings.panelColor ?? '#17191f'} onChange={e => update(d => { d.settings.panelColor = e.target.value })} /></label></div></div>
      </div>
    </section>
    <ExerciseCatalog data={data} update={update} />
    <section className="settings-card"><h2>Резервная копия</h2><button className="primary wide" onClick={downloadBackup}>Экспортировать данные</button><button className="secondary wide" onClick={() => fileRef.current?.click()}>Восстановить из файла</button><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={e => restore(e.target.files?.[0])} /><p>Перед восстановлением приложение проверяет тип и версию файла.</p></section>
    <InBodyImport data={data} update={update} />
    <section className="settings-card"><h2>Во время отдыха</h2><SettingToggle label="Вибрация" description={'vibrate' in navigator ? 'Использовать, если браузер разрешает' : 'Не поддерживается этим браузером'} checked={data.settings.vibration} disabled={!('vibrate' in navigator)} onChange={value => update(d => { d.settings.vibration = value })} /><SettingToggle label="Звуковой сигнал" description="Срабатывание на заблокированном iPhone не гарантируется" checked={data.settings.sound} onChange={value => update(d => { d.settings.sound = value })} /><SettingToggle label="Не гасить экран" description={'wakeLock' in navigator ? 'Использовать при поддержке системы' : 'Wake Lock недоступен'} checked={data.settings.keepAwake} disabled={!('wakeLock' in navigator)} onChange={value => update(d => { d.settings.keepAwake = value })} /></section>
    <section className="settings-card about-card"><span className="logo-badge">PA</span><div><h2>PAWER</h2><p>Локальный журнал тренировок · версия 1.0</p></div></section>
  </>
}

function ExerciseCatalog({ data, update }: { data: AppState; update: (fn: (draft: AppState) => void) => void }) {
  const knownZone = (category?: string) => EXERCISE_ZONES.some(zone => zone.value === category)
  const items = data.definitions.slice().sort((a, b) => {
    const aUnassigned = knownZone(a.category) ? 1 : 0
    const bUnassigned = knownZone(b.category) ? 1 : 0
    return aUnassigned - bUnassigned || a.name.localeCompare(b.name, 'ru')
  })
  return <section className="settings-card exercise-catalog"><h2>Каталог упражнений</h2><p>Назначай зону упражнениям. Без зоны они остаются в отдельной группе.</p>
    {items.length ? <div className="catalog-list">{items.map(definition => <label className="catalog-row" key={definition.id}><span><strong>{definition.name}</strong><small>{knownZone(definition.category) ? EXERCISE_ZONES.find(zone => zone.value === definition.category)?.label : 'Без зоны'}</small></span><select aria-label={`Зона упражнения ${definition.name}`} value={knownZone(definition.category) ? definition.category : ''} onChange={event => update(draft => { const target = draft.definitions.find(item => item.id === definition.id); if (target) target.category = event.target.value || undefined })}><option value="">Без зоны</option>{EXERCISE_ZONES.map(zone => <option key={zone.value} value={zone.value}>{zone.label}</option>)}</select></label>)}</div> : <p className="catalog-empty">Упражнения появятся здесь после добавления в программу.</p>}
  </section>
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Не удалось прочитать изображение'))
    reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать изображение'))
    reader.readAsDataURL(file)
  })
}

function SettingToggle({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <label className={`toggle-row ${disabled ? 'disabled' : ''}`}><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} /><i /></label>
}

type ImportPreview = { supported: boolean; message: string; fingerprint: string; data?: Partial<BodyWeightEntry & MeasurementEntry> }

function InBodyImport({ data, update }: { data: AppState; update: (fn: (draft: AppState) => void) => void }) {
  const [raw, setRaw] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const analyze = async (content: string) => {
    setBusy(true)
    const fingerprint = await fingerprintOf(content)
    if (data.imports.some(x => x.fingerprint === fingerprint)) { setPreview({ supported: false, message: 'Это измерение уже было импортировано.', fingerprint }); setBusy(false); return }
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>
      if (parsed.format === 'wolf-fit-inbody-v1' && typeof parsed.date === 'string' && typeof parsed.weightKg === 'number') setPreview({ supported: true, message: 'Поддерживаемые данные готовы к проверке.', fingerprint, data: { date: parsed.date, valueKg: parsed.weightKg, fatPercent: typeof parsed.fatPercent === 'number' ? parsed.fatPercent : undefined, fatMassKg: typeof parsed.fatMassKg === 'number' ? parsed.fatMassKg : undefined, skeletalMuscleKg: typeof parsed.skeletalMuscleKg === 'number' ? parsed.skeletalMuscleKg : undefined, waterValue: typeof parsed.waterValue === 'number' ? parsed.waterValue : undefined, waterUnit: parsed.waterUnit === 'l' || parsed.waterUnit === '%' ? parsed.waterUnit : undefined } })
      else setPreview({ supported: false, message: 'QR распознан, но формат данных не поддерживается. Нужен обезличенный пример реального QR или доступ к официальному API. Заполни измерение вручную.', fingerprint })
    } catch {
      setPreview({ supported: false, message: /^https?:\/\//i.test(content.trim()) ? 'Ссылка распознана, но приложение не отправляет по ней произвольные запросы. Возможно, требуется авторизация InBody. Используй ручной ввод.' : 'Содержимое распознано, но измерения извлечь нельзя. Используй ручной ввод.', fingerprint })
    }
    setBusy(false)
  }
  const scanImage = async (file?: File) => {
    if (!file) return
    setBusy(true)
    try {
      const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: ImageBitmap) => Promise<{ rawValue: string }[]> } }).BarcodeDetector
      if (!Detector) { setPreview({ supported: false, message: 'Этот браузер не умеет распознавать QR без дополнительного модуля. Вставь содержимое или ссылку, либо введи результаты вручную.', fingerprint: '' }); return }
      const bitmap = await createImageBitmap(file); const results = await new Detector({ formats: ['qr_code'] }).detect(bitmap)
      if (!results[0]?.rawValue) setPreview({ supported: false, message: 'QR-код на изображении не найден. Попробуй более чёткий скриншот.', fingerprint: '' }); else { setRaw(results[0].rawValue); await analyze(results[0].rawValue) }
    } catch { setPreview({ supported: false, message: 'Не удалось прочитать QR на изображении. Можно вставить его содержимое или заполнить данные вручную.', fingerprint: '' }) } finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }
  const commit = () => {
    if (!preview?.supported || !preview.data || !preview.fingerprint) return
    update(d => {
      if (d.imports.some(x => x.fingerprint === preview.fingerprint)) return
      const source = preview.data!
      if (source.valueKg !== undefined && source.date) d.bodyWeights.push({ id: uid(), date: source.date, valueKg: source.valueKg, note: 'Импорт InBody' })
      d.measurements.push({ id: uid(), date: source.date!, fatPercent: source.fatPercent, fatMassKg: source.fatMassKg, skeletalMuscleKg: source.skeletalMuscleKg, waterValue: source.waterValue, waterUnit: source.waterUnit })
      d.imports.push({ id: uid(), fingerprint: preview.fingerprint, createdAt: new Date().toISOString(), source: 'inbody-qr', rawType: raw.startsWith('http') ? 'url' : 'text' })
    })
    setRaw(''); setPreview(null)
  }
  return <section className="settings-card inbody-card"><div className="inbody-head"><div><p className="eyebrow">Экспериментальный модуль</p><h2>Импорт InBody</h2></div><span>Без передачи данных</span></div><p>Распознавание QR и импорт измерений — разные шаги. Данные сохраняются только после твоего подтверждения.</p><div className="import-actions"><button className="secondary" onClick={() => fileRef.current?.click()}>Загрузить скриншот</button><label className="secondary file-camera">Сканировать камерой<input type="file" accept="image/*" capture="environment" onChange={e => scanImage(e.target.files?.[0])} /></label><input ref={fileRef} hidden type="file" accept="image/*" onChange={e => scanImage(e.target.files?.[0])} /></div><label className="paste-field">Содержимое QR или ссылка<textarea value={raw} placeholder="Вставь текст из QR" onChange={e => { setRaw(e.target.value); setPreview(null) }} /></label><button className="primary wide" disabled={!raw.trim() || busy} onClick={() => analyze(raw.trim())}>{busy ? 'Проверяем…' : 'Распознать содержимое'}</button>
    {preview && <div className={`import-preview ${preview.supported ? 'supported' : ''}`}><strong>{preview.supported ? 'Предварительный просмотр' : 'Импорт недоступен'}</strong><p>{preview.message}</p>{preview.supported && preview.data && <><dl><div><dt>Дата</dt><dd>{fmtDate(preview.data.date!)}</dd></div><div><dt>Вес</dt><dd>{preview.data.valueKg} кг</dd></div>{preview.data.fatPercent !== undefined && <div><dt>Жир</dt><dd>{preview.data.fatPercent}%</dd></div>}{preview.data.skeletalMuscleKg !== undefined && <div><dt>Скелетные мышцы</dt><dd>{preview.data.skeletalMuscleKg} кг</dd></div>}</dl><button className="primary wide" onClick={commit}>Подтвердить импорт</button></>}</div>}
    <p className="privacy-note">QR, ссылки и результаты не отправляются в аналитику. Приложение не обходит авторизацию и не открывает произвольные ссылки.</p></section>
}

async function fingerprintOf(value: string): Promise<string> {
  if (globalThis.crypto?.subtle) { const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('') }
  let hash = 0; for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0; return `local-${hash}`
}

function WorkoutSummary({ data, workout, update, onClose, onDelete, onUpdateProgram }: { data: AppState; workout: Workout; update: (fn: (draft: AppState) => void) => void; onClose: () => void; onDelete: () => void; onUpdateProgram: () => void }) {
  const [editing, setEditing] = useState(false)
  const completed = workout.exercises.reduce((n, e) => n + e.sets.filter(s => s.status === 'completed').length, 0)
  const skipped = workout.exercises.reduce((n, e) => n + e.sets.filter(s => s.status === 'skipped').length, 0)
  const durationMin = Math.max(1, Math.round((Date.parse(workout.finishedAt ?? new Date().toISOString()) - Date.parse(workout.startedAt)) / 60000))
  const comparisons = workout.exercises.flatMap(ex => {
    const previous = previousWorkoutForExercise(data, workout, ex.exerciseDefinitionId)
    const prevEx = previous?.exercises.find(p => p.exerciseDefinitionId === ex.exerciseDefinitionId)
    return ex.sets.map((s, i) => compareSets(s, prevEx?.sets.find(p => p.templateSetId === s.templateSetId) ?? prevEx?.sets[i], ex.unit, ex.loadType))
  })
  const gains = comparisons.filter(x => x.kind === 'better').length
  const declines = comparisons.filter(x => x.kind === 'worse').length
  return <div className="summary-overlay" role="dialog" aria-modal="true"><div className="summary-page"><header className="summary-top"><button onClick={onClose}>×</button><span>{fmtDate(workout.finishedAt ?? workout.startedAt)}</span><button onClick={() => setEditing(x => !x)}>{editing ? 'Готово' : 'Исправить'}</button></header><section className="summary-hero"><div><p className="eyebrow">Тренировка сохранена</p><h1>{workout.programName}</h1><p>{gains ? `${gains} ${gains === 1 ? 'улучшение' : 'улучшения'} — отличный повод продолжать.` : 'Запись готова. Каждый честно отмеченный подход важен.'}</p></div><WolfArt compact src={data.settings.characterImageDataUrl} /></section>
    <div className="summary-metrics"><div><strong>{durationMin}</strong><span>минут</span></div><div><strong>{completed}</strong><span>подходов</span></div><div><strong>{Math.round(workoutVolumeKg(workout)).toLocaleString('ru')}</strong><span>кг объёма</span></div></div>
    <div className="summary-signals"><span className="positive">↑ {gains} улучшений</span><span className="negative">↓ {declines} снижений</span><span>○ {skipped} пропусков</span></div>
    <section className="summary-exercises"><h2>По упражнениям</h2>{workout.exercises.map(ex => { const previous = previousWorkoutForExercise(data, workout, ex.exerciseDefinitionId); const prevEx = previous?.exercises.find(p => p.exerciseDefinitionId === ex.exerciseDefinitionId); return <details key={ex.id} open><summary><strong>{ex.name}</strong><span>{ex.sets.filter(s => s.status === 'completed').length}/{ex.sets.length}</span></summary><div>{ex.sets.map((s, i) => { const matched = prevEx?.sets.find(p => p.templateSetId === s.templateSetId); const comparison = prevEx && !matched ? { kind: 'additional' as const, text: 'Дополнительный подход' } : compareSets(s, matched, ex.unit, ex.loadType); return <div className="summary-set" key={s.id}><span>{i + 1}</span>{editing ? <>{ex.loadType !== 'bodyweight' && <><input inputMode="decimal" value={s.actualWeightInput} onChange={e => update(d => { const target = d.workouts.find(x => x.id === workout.id)?.exercises.find(x => x.id === ex.id)?.sets.find(x => x.id === s.id); if (target) { target.actualWeightInput = e.target.value; const v = parseDecimal(e.target.value); target.actualWeightKg = v === null ? null : toKg(v, ex.unit) } })} /><span>{weightUnitLabel(ex.unit)} ×</span></>}<input inputMode="numeric" value={s.actualRepsInput} onChange={e => update(d => { const target = d.workouts.find(x => x.id === workout.id)?.exercises.find(x => x.id === ex.id)?.sets.find(x => x.id === s.id); if (target) target.actualRepsInput = e.target.value.replace(/\D/g, '') })} /></> : <strong>{s.status === 'completed' ? setResultLabel(ex, s.actualWeightInput, s.actualRepsInput) : 'Пропущен'}</strong>}<small className={comparison.kind}>{comparison.text}</small></div>})}</div></details>})}</section>
    {workout.programId && <button className="secondary wide" onClick={() => { if (confirm('Обновить плановые значения программы по этой тренировке?')) onUpdateProgram() }}>Обновить программу по результатам</button>}
    {!workout.programId && completed > 0 && <button className="secondary wide" onClick={() => update(d => saveWorkoutAsProgram(d, workout))}>Сохранить набор как программу</button>}
    <button className="danger-outline wide" onClick={() => { if (confirm('Удалить эту тренировку из истории? Графики и сравнения будут пересчитаны.')) onDelete() }}>Удалить тренировку</button><button className="primary wide summary-done" onClick={onClose}>Готово</button></div></div>
}

function updateProgramFromWorkout(state: AppState, workout: Workout) {
  const program = state.programs.find(p => p.id === workout.programId); if (!program) return
  program.exercises.forEach(ex => { const actual = workout.exercises.find(w => w.exerciseDefinitionId === ex.exerciseDefinitionId); if (!actual) return; ex.sets = actual.sets.filter(s => s.status === 'completed').map(s => ({ id: s.templateSetId || uid(), weightInput: s.actualWeightInput, weightKg: s.actualWeightKg, repsInput: s.actualRepsInput })) })
  program.updatedAt = new Date().toISOString()
}

function saveWorkoutAsProgram(state: AppState, workout: Workout) {
  if (state.programs.some(p => p.name === workout.programName && p.createdAt === workout.startedAt)) return
  const now = new Date().toISOString()
  state.programs.push({ id: uid(), name: workout.programName === 'Свободная тренировка' ? `Свободная ${fmtDate(workout.startedAt)}` : workout.programName, createdAt: now, updatedAt: now, exercises: workout.exercises.map(ex => ({ ...ex, id: uid(), sets: ex.sets.filter(s => s.status === 'completed').map(s => ({ id: uid(), weightInput: s.actualWeightInput, weightKg: s.actualWeightKg, repsInput: s.actualRepsInput })) })) })
}

function Empty({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span>◇</span><h3>{title}</h3><p>{text}</p>{action && <button className="secondary" onClick={onAction}>{action}</button>}</div>
}
