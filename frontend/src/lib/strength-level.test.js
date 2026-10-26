// Strength levels (lib/strength-level.js): a log-normal of the ratio 1RM / body weight, centred
// for sex, age and body weight, cut at the 30th, 80th and 97.5th percentiles.
import { describe, expect, it } from 'vitest'
import { LIFTS, levelOf, phi, ageFactor, ageOn, strengthLevels, levelUps, missingFor } from './strength-level.js'

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
