// The Profile page's "This week" (lib/week-summary.js).
import { describe, expect, it } from 'vitest'
import { weekSummary } from './week-summary.js'

const w = (id, day, ms, sets) => ({
  id, name: id, start: Date.parse(day + 'T10:00:00'), end: Date.parse(day + 'T10:00:00') + ms,
  entries: [{ id: '0025', sets: Array.from({ length: sets }, () => ({ w: 50, r: 10, done: true })) }],
})

describe('week summary', () => {
  const S = { weekStart: 1, workouts: [w('a', '2026-10-19', 3600000, 4), w('b', '2026-10-21', 1800000, 2), w('old', '2026-10-14', 3600000, 3), w('older', '2026-10-01', 60000, 1)] }

  it('marks the days of this week that were trained, today and the days still to come', () => {
    const wk = weekSummary(S, '2026-10-22')
    expect(wk.days.map(d => d.iso)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'])
    expect(wk.days.filter(d => d.trained).map(d => d.iso)).toEqual(['2026-10-19', '2026-10-21'])
    expect(wk.days.find(d => d.today).iso).toBe('2026-10-22')
    expect(wk.days.filter(d => d.future).length).toBe(3)
  })

  it('counts this week and the week before, newest workout first', () => {
    const wk = weekSummary(S, '2026-10-22')
    expect(wk.workouts.map(x => x.id)).toEqual(['b', 'a'])
    expect(wk.totals).toMatchObject({ count: 2, durMs: 5400000, sets: 6, vol: 3000 })
    expect(wk.before).toMatchObject({ count: 1, durMs: 3600000, sets: 3 })
  })

  it('follows a Sunday start', () => {
    expect(weekSummary({ ...S, weekStart: 0 }, '2026-10-22').days[0].iso).toBe('2026-10-18')
  })
})
