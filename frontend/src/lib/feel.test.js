// How you feel (lib/feel.js): a check-in a day, answered and cleared per question, merged per day
// across devices by the app and by the server's copy of the sync rules, and summed up for the coach.
import { describe, expect, it } from 'vitest'
import { readFeel, feelOn, setFeel, recentFeel, feelSummary } from './feel.js'
import { mergeStampedMap, STAMPED_MAPS } from './sync-merge.js'
import * as Server from '../../../api/sync-stamps.js'

describe('feel', () => {
  it('reads only scores 1 to 5, and nothing as null', () => {
    expect(readFeel({ energy: 4, sleep: 9, soreness: 'x' })).toEqual({ energy: 4, sleep: null, soreness: null })
    expect(readFeel({ _ts: 5 })).toBe(null)
    expect(readFeel(null)).toBe(null)
  })
  it('answering stamps the day; the same answer again clears that question only', () => {
    const s = {}
    setFeel(s, '2026-10-26', 'energy', 4, 100)
    setFeel(s, '2026-10-26', 'sleep', 2, 200)
    expect(s.feel['2026-10-26']).toEqual({ energy: 4, sleep: 2, _ts: 200 })
    setFeel(s, '2026-10-26', 'energy', 4, 300)
    expect(feelOn(s, '2026-10-26')).toEqual({ energy: null, sleep: 2, soreness: null })
    setFeel(s, '2026-10-26', 'sleep', 2, 400)
    expect(s.feel['2026-10-26']).toEqual({ _ts: 400 })
    expect(feelOn(s, '2026-10-26')).toBe(null)
  })
  it('ignores a bad day or question', () => {
    const s = {}
    setFeel(s, 'today', 'energy', 3)
    setFeel(s, '2026-10-26', 'weight', 3)
    expect(s.feel || {}).toEqual({})
  })
  it('the last days, oldest first, with gaps as null', () => {
    const S = { feel: { '2026-10-25': { energy: 3, _ts: 1 } } }
    const r = recentFeel(S, 3, '2026-10-26')
    expect(r.map(x => x.iso)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26'])
    expect(r.map(x => x.feel?.energy ?? null)).toEqual([null, 3, null])
  })
  it('two devices that checked in on different days keep both; the same day keeps the later', () => {
    expect(STAMPED_MAPS).toContain('feel')
    expect(Server.STAMPED_MAPS).toContain('feel')
    const a = { '2026-10-25': { energy: 2, _ts: 10 }, '2026-10-26': { sleep: 5, _ts: 50 } }
    const b = { '2026-10-24': { energy: 4, _ts: 5 }, '2026-10-26': { sleep: 1, _ts: 40 } }
    const m = mergeStampedMap(b, a)
    expect(Object.keys(m).sort()).toEqual(['2026-10-24', '2026-10-25', '2026-10-26'])
    expect(m['2026-10-26'].sleep).toBe(5)
  })
  it('the coach gets the week in one line, or nothing', () => {
    expect(feelSummary({ feel: {} }, '2026-10-26')).toBe('')
    const S = { feel: { '2026-10-25': { energy: 2, sleep: 3, _ts: 1 }, '2026-10-26': { energy: 4, soreness: 5, _ts: 2 } } }
    const line = feelSummary(S, '2026-10-26')
    expect(line).toContain('2 check-ins')
    expect(line).toContain('energy 3/5')
    expect(line).toContain('today energy 4/5, soreness 5/5')
  })
})
