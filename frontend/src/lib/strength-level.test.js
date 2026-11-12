// Strength levels (lib/strength-level.js): a log-normal of the ratio 1RM / body weight, centred
// for sex, age and body weight, cut at the 30th, 80th and 97.5th percentiles.
import { describe, expect, it } from 'vitest'
import { LIFTS, METRICS, levelOf, phi, ageFactor, ageOn, strengthLevels, levelUps, missingFor, readCardio, entryValue, runVO2, vo2maxOfRun, speedForVo2max, aerobicAgeFactor } from './strength-level.js'

const bench = LIFTS.find(l => l.key === 'bench')
const squat = LIFTS.find(l => l.key === 'squat')

describe('strength levels', () => {
  it('knows the five main lifts in the catalogue', () => {
    expect(LIFTS.map(l => l.key)).toEqual(['squat', 'bench', 'deadlift', 'ohp', 'row'])
  })
  it('the normal CDF is right', () => {
    expect(phi(0)).toBeCloseTo(0.5, 6)
    expect(phi(1.96)).toBeCloseTo(0.975, 3)
    expect(phi(-0.5244)).toBeCloseTo(0.30, 3)
  })
  it('the anchors land on the cut points at the reference weight and peak age', () => {
    expect(levelOf(bench, 80 * 1.0 + 0.01, 80, 'male', 28).level).toBe('intermediate')
    expect(levelOf(bench, 80 * 1.0 - 0.5, 80, 'male', 28).level).toBe('beginner')
    expect(levelOf(bench, 80 * 2.0 + 0.01, 80, 'male', 28).level).toBe('elite')
    expect(levelOf(bench, 80 * 1.5, 80, 'male', 28).level).toBe('advanced')
  })
  it('a lighter lifter needs a higher ratio for the same level, a heavier one a lower', () => {
    const light = levelOf(squat, 100, 60, 'male', 28), heavy = levelOf(squat, 100, 110, 'male', 28)
    // Same 1RM: much stronger relative to 60 kg than to 110 kg.
    expect(light.z).toBeGreaterThan(heavy.z)
    // Allometric: the 1RM needed grows slower than body weight.
    const need60 = levelOf(squat, 1, 60, 'male', 28).next.weight
    const need120 = levelOf(squat, 1, 120, 'male', 28).next.weight
    expect(need120 / need60).toBeCloseTo(Math.pow(2, 2 / 3), 2)
  })
  it('age and sex move the bar', () => {
    expect(ageFactor(30)).toBe(1)
    expect(ageFactor(60)).toBeLessThan(0.8)
    expect(levelOf(bench, 100, 80, 'male', 60).z).toBeGreaterThan(levelOf(bench, 100, 80, 'male', 30).z)
    expect(levelOf(bench, 50, 62, 'female', 30).level).toBe('intermediate')
  })
  it('works in pounds', () => {
    const kg = levelOf(bench, 100, 80, 'male', 30), lb = levelOf(bench, 100 / 0.45359237, 80 / 0.45359237, 'male', 30, 'lb')
    expect(lb.z).toBeCloseTo(kg.z, 6)
  })
  it('needs a birth date and a body weight, and reports a level reached', () => {
    const w = (d, kg, reps) => ({ id: d, d, start: Date.parse(d + 'T10:00:00'), end: Date.parse(d + 'T11:00:00'), entries: [{ id: bench.id, sets: [{ w: kg, r: reps, done: true }] }] })
    const now = Date.parse('2026-10-26T12:00:00')
    const base = { unit: 'kg', body: 'male', routines: [], exWeights: {}, bodyweight: [{ d: '2026-10-01', w: 80 }], workouts: [w('2026-10-01', 75, 5)] }
    expect(missingFor(base)).toEqual(['birth'])
    expect(strengthLevels(base, now)).toEqual([])
    const before = { ...base, birth: '1998-05-10' }
    expect(ageOn(before.birth, new Date(now))).toBe(28)
    expect(strengthLevels(before, now)[0].level).toBe('intermediate')
    const after = { ...before, workouts: [...before.workouts, w('2026-10-26', 120, 5)] }
    expect(levelUps(before, after, now)).toEqual([{ lift: bench, from: 'intermediate', to: 'advanced' }])
    expect(levelUps(after, after, now)).toEqual([])
  })
})

describe('running is read by the kind of session', () => {
  const row = (min, speed, extra = {}) => ({ min, speed, done: true, ...extra })
  const run = METRICS.find(m => m.key === 'run')
  const sprint = METRICS.find(m => m.key === 'run-sprint')

  it('matches the Daniels tables: a 5 km in 20 minutes is a VDOT of about 49.8', () => {
    expect(vo2maxOfRun(15, 20)).toBeCloseTo(49.8, 1)
    expect(speedForVo2max(vo2maxOfRun(12, 30), 30)).toBeCloseTo(12, 6)
  })

  it('a steady run counts for more the longer it is held at the same speed', () => {
    const short = readCardio({ sets: [row(10, 12)] })
    const long = readCardio({ sets: [row(40, 12)] })
    expect(short.basis.kind).toBe('endurance')
    expect(long.vo2).toBeGreaterThan(short.vo2)
    expect(long.basis).toEqual({ kind: 'endurance', min: 40, speed: 12 })
  })

  it('a slope costs oxygen: the same steady speed uphill reads higher', () => {
    expect(readCardio({ sets: [row(20, 10, { incline: 5 })] }).vo2).toBeGreaterThan(readCardio({ sets: [row(20, 10)] }).vo2)
  })

  it('intervals read VO2max from the hard segments, not from the average speed', () => {
    const sets = []
    for (let i = 0; i < 10; i++) sets.push(row(1, 12), row(0.5, 17.5))
    const r = readCardio({ sets })
    expect(r.basis).toEqual({ kind: 'hiit', min: 0.5, speed: 17.5 })
    expect(r.vo2).toBeCloseTo(runVO2(17.5) / 1.1, 6)
    expect(r.top).toBe(0)
    // The average speed of that session would read far lower.
    expect(r.vo2).toBeGreaterThan(vo2maxOfRun(14, 15))
  })

  it('repeats of a few minutes are intervals too, and too little hard running says nothing', () => {
    expect(readCardio({ sets: Array(5).fill(row(3, 15)) }).basis.kind).toBe('hiit')
    expect(readCardio({ sets: [row(2, 12), row(1, 16), row(2, 12)] }).vo2).toBe(0)
  })

  it('sprints give the top speed and no VO2max', () => {
    const sets = Array(8).fill(0).flatMap(() => [row(0.25, 22), row(2, 5)])
    const r = readCardio({ sets })
    expect(r).toMatchObject({ vo2: 0, top: 22, basis: { kind: 'sprint' } })
    expect(entryValue(sprint, { sets }).value).toBe(22)
    expect(entryValue(run, { sets }).value).toBe(0)
  })

  it('warm-up rows and rows not done are left out', () => {
    expect(readCardio({ sets: [row(20, 14, { phase: 'warmup' }), { min: 30, speed: 15, done: false }] })).toBeNull()
  })

  it('the levels list carries how a running level was read', () => {
    const S = {
      body: 'male', birth: '1996-01-01', unit: 'kg', bodyweight: [{ d: '2026-01-01', w: 75 }],
      workouts: [{ id: 'w', d: '2026-11-01', start: Date.parse('2026-11-01T10:00:00'), entries: [{ id: run.id, sets: [row(30, 12)] }] }],
    }
    const lv = strengthLevels(S, Date.parse('2026-11-12T10:00:00')).find(x => x.lift.key === 'run')
    expect(lv.type).toBe('aerobic')
    expect(lv.basis).toEqual({ kind: 'endurance', min: 30, speed: 12 })
    expect(lv.value).toBeCloseTo(vo2maxOfRun(12, 30), 6)
  })

  it('VO2max falls with age on its own curve', () => {
    expect(aerobicAgeFactor(25)).toBe(1)
    expect(aerobicAgeFactor(45)).toBeCloseTo(0.84, 6)
    expect(aerobicAgeFactor(120)).toBe(0.4)
  })
})
