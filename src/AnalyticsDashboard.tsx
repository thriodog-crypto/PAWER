import { useState } from 'react'
import type { AppState } from './types'
import { analytics, bodyEntriesInPeriod } from './analytics'
import './analytics.css'

const number = (n: number) => Number(n.toFixed(1)).toLocaleString('ru')
const date = (s: string) => new Date(s).toLocaleDateString('ru', { day: 'numeric', month: 'short' })
const colors = ['#54a7ff', '#ffb450', '#a07aff', '#4dd9b3', '#f879a3', '#d8dc74']
const change = (a: number, b: number) => b > 0 ? `${a >= b ? '+' : ''}${number((a / b - 1) * 100)}% к прошлому периоду` : 'Нет данных для сравнения'

export function AnalyticsDashboard({ data, update, onDetails }: { data: AppState; update: (fn: (draft: AppState) => void) => void; onDetails: (section: 'strength' | 'body' | 'measurements') => void }) {
  const [days, setDays] = useState(30)
  const [all, setAll] = useState(false)
  const [goalOpen, setGoalOpen] = useState(false)
  const a = analytics(data, days)
  const goal = Math.max(1, Math.min(7, data.settings.weeklyWorkoutGoal ?? 2))
  const series = all ? a.series : a.series.slice(0, 3)
  const end = Date.now()
  const x = (s: string) => 40 + (Date.parse(s) - +a.start) / Math.max(1, end - +a.start) * 490
  const max = Math.max(1, ...series.flatMap(s => s.points.map(p => p.value))) * 1.15
  const maxVolume = Math.max(1, ...a.buckets.map(b => b.value))
  const bodyRows = [
    { name: 'Вес', unit: 'кг', section: 'body' as const, entries: data.bodyWeights.map(e => ({ date: e.date, value: e.valueKg })) },
    { name: 'Талия', unit: 'см', section: 'measurements' as const, entries: data.measurements.filter(e => e.waistCm !== undefined).map(e => ({ date: e.date, value: e.waistCm! })) },
  ].map(row => ({ ...row, entries: bodyEntriesInPeriod(row.entries, a.start) }))
  return <div className="analytics-dashboard">
    <header className="analytics-heading"><p className="eyebrow">Твой прогресс</p><h1>Аналитика прогресса</h1><p>Следи за силой, объёмом и формой</p></header>
    <div className="analytics-period" aria-label="Период аналитики">{[[7, 'Неделя'], [30, 'Месяц'], [90, '3 мес.'], [365, 'Год']].map(([value, label]) => <button key={value} aria-pressed={days === value} className={days === value ? 'active' : ''} onClick={() => setDays(Number(value))}>{label}</button>)}</div>
    <div className="analytics-stats">
      <article><span className="analytics-icon">↗</span><small>Тренировок</small><strong>{a.count}</strong><span>{change(a.count, a.previousCount)}</span></article>
      <article><span className="analytics-icon">▥</span><small>Объём, кг</small><strong>{number(a.volume)}</strong><span>{change(a.volume, a.previousVolume)}</span></article>
      <article><span className="analytics-icon">▥</span><small>Рост силы</small><strong>{a.strengthChange === null ? '—' : `${a.strengthChange >= 0 ? '+' : ''}${number(a.strengthChange)}%`}</strong><span>По сопоставимым упражнениям</span></article>
      <article><span className="analytics-icon">🏆</span><small>Новых рекордов</small><strong>{a.prCount}</strong><span>Превышение личного лучшего</span></article>
    </div>
    <section className="analytics-card analytics-strength"><div className="analytics-title"><h2>Рост силы</h2><button onClick={() => setAll(!all)}>{all ? 'Первые 3' : 'Все упражнения'} ›</button></div>
      <p className="analytics-caption">Лучший рабочий вес · кг</p>
      {series.length ? <><svg className="analytics-line" viewBox="0 0 560 220" role="img" aria-label="Динамика рабочего веса по упражнениям">
        {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1="40" x2="530" y1={180 - i * 40} y2={180 - i * 40} /><text x="32" y={184 - i * 40} textAnchor="end">{Math.round(max * i / 4)}</text></g>)}
        {series.map((s, i) => <g key={s.id} style={{ color: colors[i % colors.length] }}><polyline fill="none" stroke="currentColor" strokeWidth="3" points={s.points.map(p => `${x(p.date)},${180 - p.value / max * 160}`).join(' ')} />{s.points.map((p, j) => <circle key={j} cx={x(p.date)} cy={180 - p.value / max * 160} r="4" fill="currentColor"><title>{s.name}: {number(p.value)} кг · {date(p.date)}</title></circle>)}</g>)}
        <text x="40" y="210">{date(a.start.toISOString())}</text><text x="530" y="210" textAnchor="end">{date(new Date(end).toISOString())}</text>
      </svg><div className="analytics-legend">{series.map((s, i) => <span key={s.id}><i style={{ background: colors[i % colors.length] }} />{s.name}</span>)}</div></> : <div className="analytics-empty">Здесь будет твой рост силы<span>Заверши тренировку с отягощением. Для собственного веса доступны рекорды повторений ниже.</span></div>}
      <button className="analytics-detail" onClick={() => onDetails('strength')}>Разобрать упражнение: вес, повторы, объём →</button>
    </section>
    <div className="analytics-columns"><section className="analytics-card"><div className="analytics-title"><h2>Объём по неделям</h2></div><p className="analytics-caption">Вес × повторы · кг</p><div className="analytics-bars">{a.buckets.map((b, i) => <div key={b.date} title={`${date(b.date)}: ${number(b.value)} кг`}><span>{b.value > 0 ? (b.value >= 1000 ? `${number(b.value / 1000)}к` : number(b.value)) : ''}</span><i style={{ height: `${Math.max(2, b.value / maxVolume * 100)}%` }} /><small>{a.buckets.length <= 6 || i % Math.ceil(a.buckets.length / 5) === 0 ? date(b.date) : ''}</small></div>)}</div>{a.volume === 0 && <p className="analytics-caption">Пока нет объёма с отягощением</p>}</section>
    <section className="analytics-card analytics-goal"><div className="analytics-title"><h2>Цель недели</h2><button onClick={() => setGoalOpen(!goalOpen)} aria-expanded={goalOpen}>Настроить</button></div>{goalOpen && <label className="analytics-goal-setting">Тренировок в неделю<select value={goal} onChange={e => update(d => { d.settings.weeklyWorkoutGoal = Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n}>{n}</option>)}</select></label>}<div className="analytics-ring" style={{ background: `conic-gradient(var(--green) ${Math.min(1, a.weeklyCount / goal) * 360}deg, #303943 0deg)` }}><div><strong>{a.weeklyCount} из {goal}</strong><span>тренировок</span></div></div><p>{a.weeklyCount >= goal ? 'Цель достигнута! 💪' : a.weeklyCount ? 'Хороший старт. Продолжай!' : 'Начни с одной тренировки'}</p><small>Текущая неделя · пн–вс</small></section></div>
    <div className="analytics-columns"><section className="analytics-card"><div className="analytics-title"><h2>Личные рекорды</h2></div><p className="analytics-caption">Лучшие результаты, установленные за период</p>{a.records.length ? a.records.map((r, i) => <div className="analytics-record" key={r.id}><span style={{ color: colors[i % colors.length] }}>◆</span><div><strong>{r.name}</strong><small>{date(r.date)}</small></div><b>{number(r.value)} <small>{r.unit}</small></b></div>) : <div className="analytics-empty">Рекорды впереди<span>Здесь появятся лучшие веса и повторения.</span></div>}</section>
    <section className="analytics-card"><div className="analytics-title"><h2>Изменения тела</h2></div>{bodyRows.map(row => { const first = row.entries[0]; const last = row.entries.at(-1); const delta = last && first && row.entries.length > 1 ? last.value - first.value : null; return <button className="analytics-body-row" key={row.name} onClick={() => onDetails(row.section)}><span>{row.name}<strong>{last ? `${row.entries.length > 1 ? `${number(first.value)} → ` : ''}${number(last.value)} ${row.unit}` : 'Добавить запись'}</strong></span><b>{delta === null ? '›' : `${delta > 0 ? '+' : ''}${number(delta)} ${row.unit}`}</b></button> })}<p className="analytics-caption">Изменения за выбранный период. Для сравнения нужны две записи.</p><button className="analytics-detail" onClick={() => onDetails('measurements')}>Все замеры →</button></section></div>
    <p className="analytics-footnote">Только завершённые подходы действующих упражнений. Удалённые упражнения остаются в истории, но не влияют на эту аналитику. Рост силы — среднее изменение максимального веса относительно предыдущего равного периода.</p>
  </div>
}
