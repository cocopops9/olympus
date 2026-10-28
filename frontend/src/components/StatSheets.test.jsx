// @vitest-environment happy-dom
// What is behind the numbers at the top of Stats (components/StatSheets.jsx), and the faces of
// the daily check-in (lib/feel.js goodness).
import { describe, it, expect } from 'vitest'
import { byMonth, streakDetail, recordList } from './StatSheets.jsx'
import { goodness } from '../lib/feel.js'

const w = (id, d, extra = {}) => ({ id, d, start: new Date(d + 'T18:00:00').getTime(), end: new Date(d + 'T19:00:00').getTime(), entries: [], ...extra })

describe('stat sheets', () => {
  it('groups workouts by month, newest first', () => {
    const g = byMonth([w('a', '2026-09-03'), w('b', '2026-10-20'), w('c', '2026-10-02')])
    expect(g.map(x => x.key)).toEqual(['2026-10', '2026-09'])
    expect(g[0].items.map(x => x.id)).toEqual(['b', 'c'])
  })
  it('lists the weeks of the running streak and the best run', () => {
    // Wednesday 28 October 2026, weeks starting on Monday
    const now = new Date('2026-10-28T12:00:00')
    const S = { weekStart: 1, workouts: [w('a', '2026-10-27'), w('b', '2026-10-20'), w('c', '2026-10-13'), w('d', '2026-09-01'), w('e', '2026-08-25'), w('f', '2026-08-18'), w('g', '2026-08-11')] }
    const { weeks, best } = streakDetail(S, now)
    expect(weeks.map(x => x.iso)).toEqual(['2026-10-26', '2026-10-19', '2026-10-12'])
    expect(best).toBe(4)
  })
  it('lists every record with the heaviest done set of that exercise', () => {
    const S = { workouts: [w('a', '2026-10-01', { prs: ['squat'], entries: [{ id: 'squat', sets: [{ w: 100, r: 5, done: true }, { w: 120, r: 1, done: false }, { w: 110, r: 3, done: true }] }] }), w('b', '2026-10-05')] }
    expect(recordList(S).map(r => [r.id, r.w.id, r.kg])).toEqual([['squat', 'a', 110]])
  })
  it('faces follow how good an answer is: soreness is turned round', () => {
    expect([1, 2, 3, 4, 5].map(v => goodness('energy', v))).toEqual([1, 2, 3, 4, 5])
    expect([1, 2, 3, 4, 5].map(v => goodness('soreness', v))).toEqual([5, 4, 3, 2, 1])
    expect(goodness('sleep', 9)).toBe(null)
  })
})
