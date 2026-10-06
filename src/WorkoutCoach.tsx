import { useState } from 'react'
import type { AppState, CoachFeedback, WorkoutExercise } from './types'
import { getCoachAdvice, selectCoachPhrase } from './coach'
import './coach.css'

export function WorkoutCoach({ data, workoutId, onSave }: { data: AppState; workoutId: string; onSave: (feedback: CoachFeedback, efforts: Record<string, WorkoutExercise['effort']>) => Promise<void> }) {
  const workout = data.workouts.find(w => w.id === workoutId)!
  const [editing, setEditing] = useState(!workout.coachFeedback?.reviewedAt)
  const [feedback, setFeedback] = useState<CoachFeedback>(workout.coachFeedback ?? {})
  const [efforts, setEfforts] = useState<Record<string, WorkoutExercise['effort']>>(Object.fromEntries(workout.exercises.filter(e => e.effort).map(e => [e.id, e.effort])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [missingArt, setMissingArt] = useState(false)
  const save = async (skip = false) => {
    setBusy(true); setError(false)
    try { await onSave(skip ? {} : feedback, skip ? {} : efforts); setEditing(false) }
    catch { setError(true) } finally { setBusy(false) }
  }
  const phrase = selectCoachPhrase(data, workoutId)
  const advice = getCoachAdvice(data, workoutId)
  return <section className="coach-card" aria-label="Помощник PAWER">
    {editing ? <><p className="eyebrow">Минута для себя</p><h2>Как прошла тренировка?</h2><p>Оценки необязательны. Они помогают не путать лёгкое занятие с неудачей.</p>
      <fieldset disabled={busy}><legend>Сегодня это…</legend><div className="coach-options">{([['normal', 'Обычная тренировка'], ['light', 'Лёгкая тренировка'], ['returning', 'Возвращаюсь после болезни'], ['time', 'Мало времени']] as const).map(([value, label]) => <button key={value} aria-pressed={feedback.context === value} onClick={() => setFeedback(f => ({ ...f, context: f.context === value ? undefined : value }))}>{label}</button>)}</div></fieldset>
      <fieldset disabled={busy}><legend>Самочувствие</legend><div className="coach-options">{([['good', 'Хорошее'], ['fatigued', 'Усталость'], ['symptoms', 'Боль / симптомы']] as const).map(([value, label]) => <button key={value} aria-pressed={feedback.wellbeing === value} onClick={() => setFeedback(f => ({ ...f, wellbeing: f.wellbeing === value ? undefined : value }))}>{label}</button>)}</div></fieldset>
      {workout.exercises.filter(e => e.sets.some(s => s.status === 'completed')).map(e => <fieldset disabled={busy} key={e.id}><legend>{e.name}</legend><div className="coach-options">{([['easy', 'Легко'], ['normal', 'Нормально'], ['limit', 'На пределе']] as const).map(([value, label]) => <button key={value} aria-pressed={efforts[e.id] === value} onClick={() => setEfforts(old => ({ ...old, [e.id]: old[e.id] === value ? undefined : value }))}>{label}</button>)}</div></fieldset>)}
      {error && <p role="alert">Не удалось сохранить оценку или резервную копию. Результаты не изменены. Попробуй ещё раз.</p>}
      <div className="coach-actions"><button className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Сохраняем…' : 'Показать итоги'}</button><button className="secondary" disabled={busy} onClick={() => void save(true)}>Без оценки</button></div>
    </> : <><p className="eyebrow">Твой напарник</p><div className="coach-comic"><blockquote>{phrase.text}</blockquote>{!missingArt && <img src={`${import.meta.env.BASE_URL}coach-art/${phrase.art}.png`} alt="Пёс PAWER поддерживает тебя после тренировки" onError={() => setMissingArt(true)} />}</div>
      <h3>На следующую тренировку</h3>{advice.length ? advice.map(a => <article className="coach-advice" key={a.exerciseId}><strong>{workout.exercises.find(e => e.exerciseDefinitionId === a.exerciseId)?.name}</strong><p>{a.reason}</p>{a.targetWeightKg !== undefined && <b>Ориентир: {Math.round(a.targetWeightKg * 100) / 100} кг</b>}{a.kind === 'add-rep' && <b>Первый подход: {a.targetReps} повторений</b>}<details><summary>Почему такой совет?</summary><p>По истории до {new Date(workout.finishedAt ?? workout.startedAt).toLocaleDateString('ru')}. Это осторожное правило приложения, не оценка роста мышц или медицинское назначение. План сам не меняется.</p>{a.sourceUrls.map((url, i) => <a key={url} href={url} target="_blank" rel="noreferrer">Источник {i + 1} ↗ </a>)}</details></article>) : <p>Пока недостаточно выполненных подходов для конкретного совета.</p>}
      <button className="secondary wide" onClick={() => { setFeedback(workout.coachFeedback ?? {}); setEfforts(Object.fromEntries(workout.exercises.filter(e => e.effort).map(e => [e.id, e.effort]))); setEditing(true) }}>Исправить оценку</button>
    </>}
  </section>
}
