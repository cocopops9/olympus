// The Highlights at the top of Stats (lib/stats-insights.js): the week against the last, the lift
// that went up the most, the muscles that dropped out, the month's records.
import { describe, expect, it } from 'vitest'
import { weekCounts, bestProgress, trainingGaps, monthRecords, statsInsights } from './stats-insights.js'
import { isoOf } from './format.js'

const DAY = 86400000
// A fixed Wednesday at noon, so "this week" and "last week" do not move with the clock.
const NOW = new Date('2026-10-28T12:00:00').getTime()
const ago = days => NOW - days * DAY
const workout = (daysAgo, entries, extra = {}) => ({
  id: 'w' + daysAgo + Math.random(), d: isoOf(new Date(ago(daysAgo))), start: ago(daysAgo),
  entries: entries.map(([id, sets]) => ({ id, sets: sets.map(([w, r]) => ({ w, r, done: true })) })),
  ...extra,
})
const state = workouts => ({ unit: 'kg', weekStart: 1, workouts, routines: [], bodyweight: [] })

describe('week counts', () => {
  it('counts this week and last week by the profile\'s first weekday', () => {
    const S = state([workout(0, []), workout(1, []), workout(7, []), workout(30, [])])
    expect(weekCounts(S, NOW)).toEqual({ now: 2, before: 1 })
  })
})

describe('best progress', () => {
  it('picks the lift whose recent best beat its older best by the largest share', () => {
    const S = state([
      workout(60, [['0025', [[80, 5]]], ['0043', [[100, 5]]]]),   // bench press, squat
      workout(5, [['0025', [[85, 5]]], ['0043', [[120, 5]]]]),
    ])
    const p = bestProgress(S, NOW)
    expect(p.id).toBe('0043')
    expect(p.to).toBeGreaterThan(p.from)
    expect(Math.round(p.pct)).toBe(20)
  })
  it('is null when nothing went up, or nothing has a before', () => {
    expect(bestProgress(state([workout(60, [['0025', [[90, 5]]]]), workout(5, [['0025', [[80, 5]]]])]), NOW)).toBe(null)
    expect(bestProgress(state([workout(5, [['0025', [[80, 5]]]])]), NOW)).toBe(null)
  })
})

describe('training gaps', () => {
  it('names a major muscle trained regularly that had no set in the last two weeks', () => {
    const bench = ['0025', [[80, 5], [80, 5], [80, 5]]]
    const squat = ['0043', [[100, 5], [100, 5], [100, 5]]]
    const S = state([workout(40, [bench, squat]), workout(30, [bench, squat]), workout(3, [bench])])
    const gaps = trainingGaps(S, NOW)
    expect(gaps).toContain('quadriceps')
    expect(gaps).not.toContain('chest')
  })
  it('ignores a muscle that was only ever touched once', () => {
    const S = state([workout(40, [['0043', [[100, 5]]]]), workout(3, [['0025', [[80, 5]]]])])
    expect(trainingGaps(S, NOW)).not.toContain('quadriceps')
  })
})

describe('highlights', () => {
  it('counts this month\'s records', () => {
    const S = state([workout(1, [], { prs: ['a', 'b'] }), workout(40, [], { prs: ['c'] })])
    expect(monthRecords(S, NOW)).toBe(2)
  })
  it('say nothing before the first workout, and always lead with the week once there is one', () => {
    expect(statsInsights(state([]), NOW)).toEqual([])
    const out = statsInsights(state([workout(1, [['0025', [[80, 5]]]])]), NOW)
    expect(out[0]).toEqual({ kind: 'week', now: 1, before: 0 })
  })
})
