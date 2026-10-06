import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { coachCopy } from './coachCopy'

it('ships a distinct physical illustration for every phrase scene in both tones', () => {
  const hashes = new Set()
  for (const [context, tones] of Object.entries(coachCopy)) {
    expect(tones.neutral.length).toBe(tones.playful.length)
    tones.playful.forEach((_, index) => {
      const bytes = readFileSync(new URL(`../public/coach-art/phrases/${context}-${index}.png`, import.meta.url))
      const hash = createHash('sha256').update(bytes).digest('hex')
      expect(bytes.length).toBeGreaterThan(1000)
      expect(hashes.has(hash), `${context}-${index} duplicates another image`).toBe(false)
      hashes.add(hash)
    })
  }
})
