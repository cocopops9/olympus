// Settings whose default changed after profiles had saved the old one (lib/olympus-defaults.js).
import { describe, expect, it } from 'vitest'
import { applyOlympusDefaults, needsDefaults } from './olympus-defaults.js'

describe('Olympus defaults', () => {
  it('turns the pre-workout weigh-in off and green into gold, once', () => {
    const s = { accent: 'lime', weighIn: true }
    expect(needsDefaults(s)).toBe(true)
    applyOlympusDefaults(s)
    expect(s).toMatchObject({ accent: 'gold', accentGold: true, weighIn: false, weighInQuiet: true })
    expect(needsDefaults(s)).toBe(false)
  })
  it('keeps what was chosen afterwards', () => {
    const s = applyOlympusDefaults({ accent: 'lime', weighIn: true })
    s.weighIn = true; s.accent = 'lime'
    expect(needsDefaults(s)).toBe(false)
    expect(applyOlympusDefaults(s)).toMatchObject({ weighIn: true, accent: 'lime' })
  })
})
