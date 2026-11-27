import { describe, it, expect, beforeEach } from 'vitest'
import { medalTargetItems, refreshMedalTargets, medalModel, resetMedalModel, onMedalModel, MODEL_LIFT } from './medal-targets.js'
import { LIFTS, METRICS } from './strength-level.js'

const BENCH = LIFTS.find(l => l.key === 'bench')
const SQUAT = LIFTS.find(l => l.key === 'squat')
const DAY = 86400000
const T0 = Date.UTC(2026, 0, 5, 18)
const iso = ms => new Date(ms).toISOString().slice(0, 10)
const session = (day, entries) => { const start = T0 + day * DAY; return { d: iso(start), start, end: start + 3600000, entries } }
const S = {
  unit: 'kg', body: 'female', birth: '1968-06-01', bodyweight: [{ d: '2025-12-01', w: 62 }], measurements: [],
  workouts: [0, 7, 14].map(d => session(d, [{ id: BENCH.id, sets: [{ w: 30, r: 5, done: true }] }])).concat(session(15, [{ id: SQUAT.id, sets: [{ w: 40, r: 5, done: true }] }])),
}
const NOW = T0 + 30 * DAY
const answer = items => ({ weeks: [6, 16, 40, 80, 156], gains: Object.fromEntries(items.map(i => [i.key, [0.1, 0.2, 0.3, 0.4, 0.5]])) })

describe('the medal model request', () => {
  beforeEach(() => resetMedalModel())
  it('maps every weighted exercise to a measured lift, and only those', () => {
    for (const m of METRICS) if ((m.type || 'load') === 'load') expect(MODEL_LIFT[m.key], m.key).toMatch(/^(squat|bench|deadlift)$/)
    for (const k of Object.keys(MODEL_LIFT)) expect(METRICS.find(m => m.key === k)?.type || 'load', k).toBe('load')
  })
  it('asks only for exercises whose profile is ready', () => {
    const items = medalTargetItems(S, {}, NOW)
    expect(items.map(i => i.key)).toEqual(['bench'])
    expect(items[0]).toMatchObject({ lift: 'bench', sex: 'female', age: 57, bwRatio: 1 })
    expect(Number.isFinite(items[0].z0)).toBe(true)
    expect(medalTargetItems({ ...S, birth: '' }, {}, NOW)).toEqual([])
  })
  it('keeps the answer per profile and asks again only when the inputs change', async () => {
    const calls = []
    const request = async (path, opts) => { calls.push([path, JSON.parse(opts.body)]); return answer(JSON.parse(opts.body).items) }
    let heard = 0
    const off = onMedalModel(() => heard++)
    expect(await refreshMedalTargets(S, {}, { uid: 'u1', now: NOW, request })).toBe(true)
    expect(calls[0][0]).toBe('/api/medals/targets')
    expect(medalModel('u1').bench).toEqual([0.1, 0.2, 0.3, 0.4, 0.5])
    expect(medalModel('u2')).toEqual({})
    expect(await refreshMedalTargets(S, {}, { uid: 'u1', now: NOW + DAY, request })).toBe(false)
    expect(calls.length).toBe(1)
    const heavier = { ...S, bodyweight: [...S.bodyweight, { d: iso(NOW - DAY), w: 70 }] }
    expect(await refreshMedalTargets(heavier, {}, { uid: 'u1', now: NOW + DAY, request })).toBe(true)
    expect(calls.length).toBe(2)
    expect(heard).toBe(2)
    off()
  })
  it('keeps what it had when the server fails or answers something else', async () => {
    await refreshMedalTargets(S, {}, { uid: 'u1', now: NOW, request: async (_, o) => answer(JSON.parse(o.body).items) })
    expect(await refreshMedalTargets(S, {}, { uid: 'u1', now: NOW + 30 * DAY, request: async () => { throw new Error('offline') } })).toBe(false)
    expect(await refreshMedalTargets(S, {}, { uid: 'u1', now: NOW + 30 * DAY, request: async () => ({ weeks: [1], gains: {} }) })).toBe(false)
    expect(medalModel('u1').bench).toBeTruthy()
    expect(await refreshMedalTargets(S, {}, { now: NOW })).toBe(false)   // no profile, no request
  })
})
