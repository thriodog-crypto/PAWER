// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CoachSchedule, CoachSettings, CoachLoadStep } from './CoachSchedule'
import { emptyState } from './storage'
it('does not invent a recovery date without selected weekdays', () => {
  expect(renderToStaticMarkup(<CoachSchedule data={emptyState()} />)).toContain('Выбери дни')
})
it('renders optional preferences and a unit-aware equipment step', () => {
  const data = emptyState(); data.settings.trainingDays = [1]; data.settings.coachTone = 'neutral'
  const html = renderToStaticMarkup(<CoachSettings data={data} update={() => {}} />)
  expect(html).toContain('aria-pressed="true"'); expect(html).toContain('Нейтральный')
  expect(renderToStaticMarkup(<CoachLoadStep definition={{ id: 'x', name: 'Тяга', createdAt: '', loadStep: { value: 5, unit: 'lb' } }} onEdit={() => {}} />)).toContain('value="5"')
})
