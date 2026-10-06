// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkoutSummary } from './App'
import { WorkoutCoach } from './WorkoutCoach'
import { emptyState } from './storage'
import { startWorkout, makeProgram, makeExercise } from './domain'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const host = document.createElement('div'); document.body.append(host)
const root = createRoot(host)
afterEach(async () => { await act(async () => root.render(null)) })
const fixture = () => { const data = emptyState(); const w = startWorkout(null); w.status = 'completed'; w.finishedAt = new Date().toISOString(); data.workouts = [w]; return { data, w } }
const click = async (text: string) => { const b = [...host.querySelectorAll('button')].find(b => b.textContent === text)!; expect(b).toBeTruthy(); await act(async () => b.click()) }
it('does not claim the workout is saved when persistence failed', () => {
  const { data, w } = fixture()
  const markup = renderToStaticMarkup(<WorkoutSummary data={data} workout={w} update={vi.fn()} onClose={vi.fn()} onDelete={vi.fn()} onUpdateProgram={vi.fn()} onSaveCoach={vi.fn()} saveStatus="error" />)
  expect(markup).not.toContain('Тренировка сохранена')
  expect(markup).toContain('Не удалось сохранить')
})
it('leaves assessments unknown when skipped and shows the character after saving', async () => {
  const { data, w } = fixture(); const save = vi.fn().mockResolvedValue(undefined)
  await act(async () => root.render(<WorkoutCoach data={data} workoutId={w.id} onSave={save} />))
  expect(host.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0)
  await click('Без оценки')
  expect(save).toHaveBeenCalledWith({}, {})
  expect(host.querySelector('img')).toBeTruthy()
})
it('keeps input and allows retry on storage failure', async () => {
  const { data, w } = fixture(); const save = vi.fn().mockRejectedValueOnce(Error('disk')).mockResolvedValue(undefined)
  await act(async () => root.render(<WorkoutCoach data={data} workoutId={w.id} onSave={save} />))
  await click('Возвращаюсь после болезни'); await click('Показать итоги')
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Не удалось')
  await click('Показать итоги'); expect(save).toHaveBeenLastCalledWith({ context: 'returning' }, {})
  expect(host.querySelector('img')).toBeTruthy()
})
it('opens reviewed history without a questionnaire and prioritizes custom art', async () => {
  const { data, w } = fixture(); w.coachFeedback = { reviewedAt: new Date().toISOString() }; data.settings.characterImageDataUrl = 'custom.png'
  await act(async () => root.render(<WorkoutCoach data={data} workoutId={w.id} onSave={vi.fn()} />))
  expect(host.textContent).not.toContain('Как прошла тренировка?')
  expect(host.querySelector('img')?.getAttribute('src')).toBe('custom.png')
  await click('Исправить оценку'); expect(host.textContent).toContain('Как прошла тренировка?')
})
it('labels advice by definition ID and does not resurrect skipped effort', async () => {
  const data = emptyState(); const p = makeProgram(); p.exercises.push(makeExercise('Тестовая тяга'))
  const w = startWorkout(p); w.status = 'completed'; w.finishedAt = new Date().toISOString()
  w.exercises[0].sets.forEach(s => { s.status = 'completed'; s.actualWeightKg = 10; s.actualRepsInput = '10' })
  data.workouts.push(w); data.definitions.push({ id: w.exercises[0].exerciseDefinitionId, name: 'Тестовая тяга', createdAt: '' })
  const save = vi.fn(async (feedback, efforts) => { w.coachFeedback = { ...feedback, reviewedAt: new Date().toISOString() }; w.exercises[0].effort = efforts[w.exercises[0].id] })
  await act(async () => root.render(<WorkoutCoach data={data} workoutId={w.id} onSave={save} />))
  await click('Легко'); await click('Без оценки')
  expect(host.querySelector('.coach-advice strong')?.textContent).toBe('Тестовая тяга')
  await click('Исправить оценку')
  expect(host.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0)
})
