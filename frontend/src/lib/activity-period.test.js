import { describe, expect, it } from 'vitest'
import { periodOf, periodSummary, bestWeekRun, WEEKS_PER_PAGE } from './activity-period.js'
import { MONDAY, SUNDAY } from './format.js'

describe('periodOf', () => {
  it('gives the calendar month holding today, and earlier months by offset across a year end', () => {
    expect(periodOf('month', 0, '2026-11-23')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(periodOf('month', -1, '2026-11-23')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(periodOf('month', -11, '2026-11-23')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(periodOf('month', -9, '2026-11-23')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(periodOf('month', -1, '2024-03-31')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })

  it('gives calendar years by offset', () => {
    expect(periodOf('year', 0, '2026-11-23')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(periodOf('year', -3, '2026-01-01')).toEqual({ from: '2023-01-01', to: '2023-12-31' })
  })

  it('gives twelve whole weeks ending with the current week, then the twelve before, with no gap or overlap', () => {
    // 2026-11-23 is a Monday.
    const now = periodOf('weeks', 0, '2026-11-25', MONDAY)
    expect(now).toEqual({ from: '2026-09-07', to: '2026-11-29' })
    const before = periodOf('weeks', -1, '2026-11-25', MONDAY)
    expect(before.to).toBe('2026-09-06')
    const days = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000) + 1
    expect(days(now.from, now.to)).toBe(WEEKS_PER_PAGE * 7)
    expect(days(before.from, before.to)).toBe(WEEKS_PER_PAGE * 7)
  })

  it('follows a Sunday week start', () => {
    expect(periodOf('weeks', 0, '2026-11-25', SUNDAY)).toEqual({ from: '2026-09-06', to: '2026-11-28' })
  })

  it('never moves past the period holding today', () => {
    expect(periodOf('month', 2, '2026-11-23')).toEqual(periodOf('month', 0, '2026-11-23'))
    expect(periodOf('year', 1, '2026-11-23')).toEqual(periodOf('year', 0, '2026-11-23'))
  })
})

describe('bestWeekRun', () => {
  it('counts the longest run of consecutive trained weeks', () => {
    // Weeks of 2 Nov, 9 Nov, 16 Nov (two days in it), then a gap, then 7 Dec.
    expect(bestWeekRun(['2026-11-02', '2026-11-10', '2026-11-16', '2026-11-18', '2026-12-07'], MONDAY)).toBe(3)
    expect(bestWeekRun([], MONDAY)).toBe(0)
  })

  it('depends on the week start: Sunday and the Monday after are one Sunday-first week, two Monday-first ones', () => {
    expect(bestWeekRun(['2026-11-22', '2026-11-23'], MONDAY)).toBe(2)
    expect(bestWeekRun(['2026-11-22', '2026-11-23'], SUNDAY)).toBe(1)
  })
})

describe('periodSummary', () => {
  const agg = {
    '2025-12-31': { n: 1, min: 40, vol: 1000 },
    '2026-01-01': { n: 2, min: 90, vol: 5000 },
    '2026-01-08': { n: 1, min: 30, vol: 2000 },
    '2026-02-01': { n: 1, min: 60, vol: 3000 },
  }

  it('adds up only the days inside the period, both ends included', () => {
    expect(periodSummary(agg, '2026-01-01', '2026-01-31')).toEqual({ days: 2, n: 3, min: 120, vol: 7000, bestRun: 2 })
    expect(periodSummary(agg, '2025-01-01', '2025-12-31')).toEqual({ days: 1, n: 1, min: 40, vol: 1000, bestRun: 1 })
  })

  it('is all zeros for an empty period', () => {
    expect(periodSummary(agg, '2024-01-01', '2024-12-31')).toEqual({ days: 0, n: 0, min: 0, vol: 0, bestRun: 0 })
    expect(periodSummary(undefined, '2024-01-01', '2024-12-31').days).toBe(0)
  })
})
