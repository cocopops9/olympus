import { describe, it, expect } from 'vitest'
import {
  curve, trainingAgeOf, expectedGain, effectiveBw, cleanFacts, profileOf, athleteBase, zOf, valueAt,
  confirmedSeries, earnedAt, keptFor, ageResponse, TIERS, Z_CEILING, MIN_WEEKS,
} from './athlete-profile.js'
import { LIFTS } from './strength-level.js'

const BENCH = LIFTS.find(l => l.key === 'bench')
const DAY = 86400000
const T0 = Date.UTC(2026, 0, 5, 18)
const iso = ms => new Date(ms).toISOString().slice(0, 10)
const session = (day, w, r = 1) => { const start = T0 + day * DAY; return { d: iso(start), start, end: start + 3600000, entries: [{ id: BENCH.id, sets: [{ w, r, done: true }] }] } }
const person = (over = {}) => ({ unit: 'kg', body: 'male', birth: '1990-06-01', bodyweight: [{ d: '2025-12-01', w: 80 }], measurements: [], workouts: [], ...over })
const NOW = T0 + 120 * DAY

describe('the training curve', () => {
  it('starts at the untrained z, rises fast, then slowly towards the ceiling', () => {
    expect(curve(0)).toBe(-1)
    expect(curve(0.75)).toBeCloseTo(0.5, 6)            // half of all gains at the half-time
    expect(curve(20)).toBeLessThan(Z_CEILING)
    expect(curve(1) - curve(0)).toBeGreaterThan(curve(4) - curve(3))
  })
  it('inverts: the training age of a z', () => {
    for (const tau of [0.1, 0.5, 2, 6]) expect(trainingAgeOf(curve(tau))).toBeCloseTo(tau, 6)
    expect(trainingAgeOf(-2)).toBe(0)
    expect(trainingAgeOf(2.4)).toBe(Infinity)
  })
  it('expects about 12 % on a novice bench in six weeks and never less than the floor', () => {
    const sigma = 0.2795
    expect(Math.exp(expectedGain(0, 6 / 52, 'load', sigma) * sigma)).toBeCloseTo(1.12, 1)
    // At the ceiling only the slow gains of the floor are left: 0.045 sqrt(3) in ln units over three years.
    expect(expectedGain(Infinity, 3, 'load', sigma) * sigma).toBeCloseTo(0.045 * Math.sqrt(3), 6)
  })
  it('responds less from 50 on, never below 70 %', () => {
    expect(ageResponse(40)).toBe(1)
    expect(ageResponse(60)).toBeCloseTo(0.9, 6)
    expect(ageResponse(95)).toBe(0.7)
  })
})

describe('body composition', () => {
  it('counts a lean heavy athlete as heavier and a fat one as lighter', () => {
    expect(effectiveBw(105, 'male', 10)).toBeCloseTo(111.2, 1)
    expect(effectiveBw(105, 'male', 35)).toBeCloseTo(80.3, 1)
    expect(effectiveBw(80, 'male', null)).toBe(80)
  })
  it('a lean athlete needs more on the bar for the same z', () => {
    const who = { sex: 'male', age: 30, bw: 105, unit: 'kg' }
    expect(valueAt(BENCH, 1, { ...who, fat: 10 })).toBeGreaterThan(valueAt(BENCH, 1, who))
    expect(zOf(BENCH, valueAt(BENCH, 1.3, who), who)).toBeCloseTo(1.3, 6)
  })
})

describe('what the coaches read', () => {
  it('keeps only sensible facts', () => {
    expect(cleanFacts({ trainingYears: 4, returning: true })).toEqual({ trainingYears: 4, returning: true })
    expect(cleanFacts({ trainingYears: -1, returning: 'yes' })).toEqual({})
    expect(cleanFacts(null)).toEqual({})
  })
})

describe('the profile of one exercise', () => {
  const base = S => athleteBase(S, NOW)
  it('needs sex, birth date and body weight', () => {
    const S = person({ birth: '', workouts: [session(0, 80)] })
    expect(profileOf(S, BENCH, base(S)).status).toBe('missing')
  })
  it('calibrates over three sessions and two weeks before setting targets', () => {
    const two = person({ workouts: [session(0, 80), session(3, 80)] })
    const p = profileOf(two, BENCH, base(two))
    expect(p.status).toBe('calibrating')
    expect(p.need.sessions).toBe(1)
    const three = person({ workouts: [session(0, 80), session(7, 80), session(14, 82.5)] })
    expect(profileOf(three, BENCH, base(three)).status).toBe('ready')
  })
  it('sets rising thresholds above the starting point', () => {
    const S = person({ workouts: [0, 7, 14].map(d => session(d, 80)) })
    const p = profileOf(S, BENCH, base(S))
    let prev = p.z0
    for (const tier of TIERS) { expect(p.thresholds[tier]).toBeGreaterThan(prev); prev = p.thresholds[tier] }
  })
  it('gives a lifter who has trained for years smaller steps than a beginner at the same numbers', () => {
    const S = person({ workouts: [0, 7, 14].map(d => session(d, 80)) })
    const fresh = profileOf(S, BENCH, base(S))
    const veteran = profileOf(S, BENCH, base(S), { trainingYears: 6 })
    expect(veteran.thresholds.gold - veteran.z0).toBeLessThan(fresh.thresholds.gold - fresh.z0)
    // A returning athlete is placed by the readings, whatever the years.
    const back = profileOf(S, BENCH, base(S), { trainingYears: 6, returning: true })
    expect(back.thresholds.gold).toBeCloseTo(fresh.thresholds.gold, 6)
  })
  it('a fast responder gets nearer targets raised more than far ones', () => {
    const flat = person({ workouts: [0, 7, 14, ...Array.from({ length: 12 }, (_, i) => 21 + i * 7)].map(d => session(d, 80)) })
    const fast = person({ workouts: [0, 7, 14, ...Array.from({ length: 12 }, (_, i) => 21 + i * 7)].map((d, i) => session(d, i < 3 ? 80 : 80 + (i - 2) * 3)) })
    const a = profileOf(flat, BENCH, base(flat)), b = profileOf(fast, BENCH, base(fast))
    expect(b.rho).toBeGreaterThan(1)
    expect(a.rho).toBeLessThan(1)
    const lift = (p, tier) => (p.thresholds[tier] - p.z0)
    expect(lift(b, 'bronze') / lift(a, 'bronze')).toBeGreaterThan(lift(b, 'olympian') / lift(a, 'olympian'))
  })
})

describe('earning a tier', () => {
  const pts = [[0, 1.0], [3, 1.6], [6, 1.1], [9, 1.5], [12, 1.55]].map(([d, z]) => ({ d: iso(T0 + d * DAY), t: T0 + d * DAY, z }))
  it('takes a confirmed reading: one lucky estimate is not enough', () => {
    const conf = confirmedSeries(pts)
    expect(conf[0].z).toBe(1.0)              // day 3: second best of 1.0 and 1.6
    expect(Math.max(...conf.map(p => p.z))).toBe(1.55)
    expect(earnedAt(pts, 1.6)).toBe(null)
    expect(earnedAt(pts, 1.5)).toBe(iso(T0 + 9 * DAY))   // 1.6 and 1.5 within four weeks
  })
  it('takes a minimum of trained weeks', () => {
    expect(earnedAt(pts, 1.0, 1)).toBe(iso(T0 + 3 * DAY))
    expect(earnedAt(pts, 1.0, MIN_WEEKS.olympian)).toBe(null)
  })
})

describe('strength kept with age', () => {
  it('counts the years a 60-year-old holds within 5 % of an old best', () => {
    const years = y => Math.round(y * 365.25)
    const S = person({ birth: '1964-01-01', workouts: [session(-years(3), 100), session(-years(2), 98), session(0, 96), session(1, 90)] })
    const k = keptFor(S, athleteBase(S, T0 + 2 * DAY), T0 + 2 * DAY)
    expect(k.years).toBe(3)
    expect(k.metric.key).toBe('bench')
  })
  it('does not count before 40', () => {
    const S = person({ birth: '2000-01-01', workouts: [session(-800, 100), session(0, 100)] })
    expect(keptFor(S, athleteBase(S, T0 + DAY), T0 + DAY).years).toBe(0)
  })
})
