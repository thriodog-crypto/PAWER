import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { AchievementProgress } from './domain'
import './rewards.css'

export function rewardTheme(id: string) {
  if (id.startsWith('rhythm')) return { color: '#b794ff', deep: '#482788', label: 'ПОСТОЯНСТВО', praise: 'Ты держишь ритм. Вот так рождается привычка!' }
  if (id.startsWith('weight')) return { color: '#ff9b52', deep: '#8b361c', label: 'СИЛА', praise: 'Новый личный рубеж. Есть чем гордиться!' }
  if (id.startsWith('reps')) return { color: '#52e2ff', deep: '#155d87', label: 'ВЫНОСЛИВОСТЬ', praise: 'Твой труд превращается в результат!' }
  if (id.startsWith('sets')) return { color: '#6af2ad', deep: '#17624b', label: 'РАБОТА', praise: 'Каждый подход — вклад в твою силу!' }
  if (id.startsWith('volume')) return { color: '#ff76bb', deep: '#802859', label: 'ОБЪЁМ', praise: 'Вот это работа! Ты заслужил эту награду.' }
  return { color: '#ffda71', deep: '#875317', label: 'ДОСТИЖЕНИЕ', praise: 'Это твоя победа. PAWER тобой гордится!' }
}

export function rewardStyle(id: string): CSSProperties {
  const theme = rewardTheme(id)
  return { '--reward-color': theme.color, '--reward-deep': theme.deep } as CSSProperties
}

export function RewardBadge({ item }: { item: AchievementProgress }) {
  return <span className="reward-badge" aria-hidden="true" style={rewardStyle(item.id)}><svg viewBox="0 0 100 112"><path d="M50 4 92 27v48L50 108 8 75V27Z" fill="var(--reward-deep)" stroke="var(--reward-color)" strokeWidth="3"/><path d="M50 12 84 31v40L50 98 16 71V31Z" fill="none" stroke="var(--reward-color)" opacity=".4"/><path d="m23 84 27 17 27-17M24 24l26-14 26 14" fill="none" stroke="white" opacity=".5"/></svg><span>{item.icon}</span><b>✦</b></span>
}

let rewardAudio: AudioContext | undefined
export function prepareRewardAudio() {
  try { rewardAudio ??= new AudioContext(); void rewardAudio.resume().catch(() => undefined) } catch { /* Optional audio. */ }
}
async function playRewardSound() {
  prepareRewardAudio()
  const audio = rewardAudio
  if (!audio) return
  try { await audio.resume() } catch { return }
  if (audio.state !== 'running') return
  ;[523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
    const oscillator = audio.createOscillator(); const gain = audio.createGain()
    const start = audio.currentTime + index * .12
    oscillator.type = 'sine'; oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.09, start + .015); gain.gain.exponentialRampToValueAtTime(.001, start + .55)
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start + .6)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  })
}

export function AchievementReward({ items, onClose }: { items: AchievementProgress[]; onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const [muted, setMuted] = useState(() => localStorage.getItem('pawer-reward-muted') === 'true')
  const closeRef = useRef<HTMLButtonElement>(null)
  const item = items[index]
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; closeRef.current?.focus()
    return () => { document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  useEffect(() => { if (!muted && item?.unlocked) playRewardSound() }, [index, muted, item?.unlocked])
  if (!item) return null
  const theme = rewardTheme(item.id)
  return <div className="reward-overlay" role="dialog" aria-modal="true" aria-label={item.title} style={rewardStyle(item.id)} onKeyDown={event => {
    if (event.key === 'Escape') onClose()
    if (event.key === 'Tab') { const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button')); const first = buttons[0]; const last = buttons[buttons.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() } }
  }}>
    <button ref={closeRef} className="reward-close" aria-label="Закрыть награду" onClick={onClose}>×</button>
    <div className="reward-stage" key={item.id}>
      {item.unlocked && <div className="reward-confetti" aria-hidden="true">{Array.from({ length: 32 }, (_, i) => <i key={i} style={{ '--x': `${(i * 37) % 100}%`, '--delay': `${(i % 8) * .09}s`, '--spin': `${i * 47}deg`, background: [theme.color, '#fff', '#ff84bb', '#7eeed7'][i % 4] } as CSSProperties} />)}</div>}
      <p className="reward-kicker">{item.unlocked ? '✦ НАГРАДА ТВОЯ ✦' : 'ТВОЯ СЛЕДУЮЩАЯ ЦЕЛЬ'}</p>
      <RewardBadge item={item} />
      <span className="reward-category">{theme.label}</span><h2>{item.title}</h2>
      <p className="reward-requirement">{item.description}</p>
      <p className="reward-praise">{item.unlocked ? theme.praise : `${item.progress.toLocaleString('ru')} из ${item.target.toLocaleString('ru')} — каждый шаг считается.`}</p>
      <button className="reward-claim" onClick={() => index < items.length - 1 ? setIndex(index + 1) : onClose()}>{index < items.length - 1 ? `Следующая награда · ${index + 1}/${items.length}` : item.unlocked ? 'Забрать победу!' : 'Буду двигаться к цели'}</button>
      <button className="reward-sound" onClick={() => { localStorage.setItem('pawer-reward-muted', String(!muted)); setMuted(!muted) }}>{muted ? 'Звук выключен · включить' : '♫ Звук наград включён'}</button>
    </div>
  </div>
}
