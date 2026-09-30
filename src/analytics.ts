import type { AppState } from './types'
import { parseReps } from './domain'

export function analyticsData(data: AppState, now = new Date()): AppState {
  const definitions = data.definitions.filter(d => !d.archived)
  const ids = new Set(definitions.map(d => d.id))
  const workouts = data.workouts.filter(w => w.status === 'completed' && Date.parse(w.finishedAt ?? w.startedAt) <= +now).map(w => ({ ...w, exercises: w.exercises.filter(e => ids.has(e.exerciseDefinitionId)).map(e => ({ ...e, sets: e.sets.filter(s => s.status === 'completed' && (parseReps(s.actualRepsInput) ?? 0) > 0 && (e.loadType === 'bodyweight' || (s.actualWeightKg !== null && Number.isFinite(s.actualWeightKg) && s.actualWeightKg >= 0))) })).filter(e => e.sets.length) })).filter(w => w.exercises.length)
  return { ...data, definitions, workouts }
}

export function analytics(data: AppState, days: number, now = new Date()) {
  const clean = analyticsData(data, now)
  clean.workouts.sort((a, b) => Date.parse(a.finishedAt ?? a.startedAt) - Date.parse(b.finishedAt ?? b.startedAt))
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - days + 1)
  const prior = new Date(start); prior.setDate(prior.getDate() - days)
  const week = new Date(now); week.setHours(0, 0, 0, 0); week.setDate(week.getDate() - (week.getDay() + 6) % 7)
  const time = (w: AppState['workouts'][number]) => Date.parse(w.finishedAt ?? w.startedAt)
  const selected = clean.workouts.filter(w => time(w) >= +start)
  const previous = clean.workouts.filter(w => time(w) >= +prior && time(w) < +start)
  const volumeOf = (workouts: typeof selected) => workouts.reduce((total, w) => total + w.exercises.reduce((sum, e) => sum + (e.loadType === 'external' ? e.sets.reduce((n, s) => n + (s.actualWeightKg ?? 0) * (parseReps(s.actualRepsInput) ?? 0), 0) : 0), 0), 0)
  const series = clean.definitions.flatMap(d => {
    const points = selected.flatMap(w => {
      const sets = w.exercises.filter(e => e.exerciseDefinitionId === d.id && e.loadType === 'external').flatMap(e => e.sets)
      return sets.length ? [{ date: w.finishedAt ?? w.startedAt, value: Math.max(...sets.map(s => s.actualWeightKg ?? 0)) }] : []
    })
    return points.length ? [{ id: d.id, name: d.name, points }] : []
  })
  const records: { id: string; name: string; value: number; unit: string; date: string }[] = []
  let prCount = 0
  for (const d of clean.definitions) for (const type of ['external', 'bodyweight'] as const) {
    let best: number | undefined
    let record: typeof records[number] | undefined
    for (const w of clean.workouts) {
      const sets = w.exercises.filter(e => e.exerciseDefinitionId === d.id && e.loadType === type).flatMap(e => e.sets)
      if (!sets.length) continue
      const value = Math.max(...sets.map(s => type === 'external' ? s.actualWeightKg ?? 0 : parseReps(s.actualRepsInput) ?? 0))
      if (best === undefined || value > best) {
        if (best !== undefined && time(w) >= +start) prCount++
        best = value
        record = { id: `${d.id}-${type}`, name: d.name, value, unit: type === 'external' ? 'кг' : 'повт.', date: w.finishedAt ?? w.startedAt }
      }
    }
    if (record && Date.parse(record.date) >= +start) records.push(record)
  }
  const changes = series.flatMap(s => {
    const values = previous.flatMap(w => w.exercises.filter(e => e.exerciseDefinitionId === s.id && e.loadType === 'external').flatMap(e => e.sets.map(set => set.actualWeightKg ?? 0)))
    const before = Math.max(0, ...values)
    return before > 0 ? [(Math.max(...s.points.map(p => p.value)) / before - 1) * 100] : []
  })
  const buckets: { date: string; value: number }[] = []
  for (let offset = 0; offset < days; offset += 7) {
    const a = new Date(start); a.setDate(a.getDate() + offset)
    const b = new Date(a); b.setDate(b.getDate() + 7)
    buckets.push({ date: a.toISOString(), value: volumeOf(selected.filter(w => time(w) >= +a && time(w) < +b)) })
  }
  return { start, count: selected.length, previousCount: previous.length, volume: volumeOf(selected), previousVolume: volumeOf(previous), prCount, strengthChange: changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null, series, records: records.sort((a, b) => b.date.localeCompare(a.date)), buckets, weeklyCount: clean.workouts.filter(w => time(w) >= +week).length }
}

export function bodyEntriesInPeriod<T extends { date: string }>(entries: T[], start: Date, now = new Date()): T[] {
  const end = new Date(now); end.setHours(23, 59, 59, 999)
  return entries.filter(e => Date.parse(e.date) >= +start && Date.parse(e.date) <= +end).sort((a, b) => a.date.localeCompare(b.date))
}
