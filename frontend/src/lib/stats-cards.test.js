// Which statistics the Stats page shows (lib/stats-cards.js): a short default, the saved choice in
// its order without unknown ids, and the toggling and moving the picker does.
import { describe, expect, it } from 'vitest'
import { statsCardsOf, defaultStatsCards, toggleCard, moveCard, STATS_IDS } from './stats-cards.js'

describe('stats cards', () => {
  it('the default leaves photos out, and effort unless effort is logged', () => {
    const d = defaultStatsCards({ effort: null })
    expect(d).toContain('summary')
    expect(d).not.toContain('photos')
    expect(d).not.toContain('effort')
    expect(defaultStatsCards({ effort: 'rpe' })).toContain('effort')
    expect(d.length).toBeLessThan(STATS_IDS.length)
  })
  it('never chosen reads as the default; a choice keeps its order, without unknown or repeated ids', () => {
    expect(statsCardsOf({ statsCards: null })).toEqual(defaultStatsCards({}))
    expect(statsCardsOf({ statsCards: ['recent', 'nope', 'summary', 'recent'] })).toEqual(['recent', 'summary'])
    expect(statsCardsOf({ statsCards: [] })).toEqual([])
  })
  it('toggling adds at the end or removes; moving reorders and ignores bad indexes', () => {
    expect(toggleCard(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
    expect(toggleCard(['a', 'b'], 'a')).toEqual(['b'])
    expect(moveCard(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveCard(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
    expect(moveCard(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
  })
})
