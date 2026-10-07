import { useState } from 'react'
import type { AppState, Workout } from './types'
import { calorieInputs, estimateCalories } from './calories'
import { parseDecimal } from './domain'

export function WorkoutCalories({ data, workout, update }: { data: AppState; workout: Workout; update: (fn: (draft: AppState) => void) => void }) {
  const inputs = calorieInputs(data, workout)
  const completed = workout.exercises.reduce((n, e) => n + e.sets.filter(s => s.status === 'completed').length, 0)
  const result = estimateCalories(inputs, completed)
  const [weight, setWeight] = useState(inputs.weightKg ? String(inputs.weightKg) : '')
  const [minutes, setMinutes] = useState(Number.isFinite(inputs.minutes) && inputs.minutes > 0 ? String(Math.round(inputs.minutes * 10) / 10) : '')
  const [intensity, setIntensity] = useState(inputs.intensity)
  const [error, setError] = useState('')
  return <section className="summary-exercises calorie-card"><p className="eyebrow">Расход энергии · приблизительно</p>
    <h2>{result ? `≈ ${result.active.toLocaleString('ru')} ккал` : completed ? 'Уточни вес и время' : 'Нет выполненных подходов'}</h2>
    {result && <p>Активные калории · общий расход с обменом в покое ≈ {result.total.toLocaleString('ru')} ккал</p>}
    <p>Оценка по массе тела, времени и интенсивности. Обычный отдых между подходами входит в занятие. Долгие перерывы и время после окончания упражнений вычти из длительности.</p>
    <details open={!result && completed > 0}><summary>Уточнить расчёт</summary><form onSubmit={e => {
      e.preventDefault(); const weightKg = parseDecimal(weight); const duration = parseDecimal(minutes)
      if (weightKg === null || weightKg <= 0 || duration === null || duration <= 0) { setError('Укажи положительные вес и длительность.'); return }
      update(d => { const w = d.workouts.find(w => w.id === workout.id); if (w) w.calorieInputs = { weightKg, minutes: duration, intensity } }); setError('')
    }}><label>Масса тела, кг<input inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} /></label>
      <label>Занятие с обычным отдыхом, мин<input inputMode="decimal" value={minutes} onChange={e => setMinutes(e.target.value)} /></label>
      <label>Интенсивность<select value={intensity} onChange={e => setIntensity(e.target.value as typeof intensity)}><option value="standard">Обычная силовая</option><option value="vigorous">Интенсивная силовая</option></select></label>
      {error && <p role="alert">{error}</p>}<button className="secondary wide" type="submit">Сохранить и пересчитать</button>
    </form><p>MET × 3,5 × вес / 200 × минуты; для активных калорий вычитается 1 MET покоя. Обычная силовая — 3,5 MET, интенсивная — 6 MET. Это усреднённый ориентир, а не измерение: веса и повторения не определяют расход точно.</p><a href="https://pacompendium.com/conditioning-exercise/" target="_blank" rel="noreferrer">Источник: Compendium 2024 ↗</a></details>
  </section>
}
