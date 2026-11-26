// A typed weight far above what the person has ever lifted is flagged as a likely typo.
import { describe, expect, it } from 'vitest'
import { implausibleLoad, topLoadOf } from './plausible-load.js'

const DB_BENCH = '0289'
const set = (w, r, done = true) => ({ w, r, done })
const workout = (d, sets) => ({ id: d, d, start: Date.parse(d + 'T10:00:00'), end: Date.parse(d + 'T11:00:00'), entries: [{ id: DB_BENCH, sets }] })
const S = (workouts, unit = 'kg') => ({ unit, workouts, exWeights: {}, routines: [], bodyweight: [] })

describe('implausible loads', () => {
  // 76 x 12: Epley 76 * (1 + 12/30) = 106.4 kg, the reported profile's best on this exercise.
  const past = S([workout('2026-05-16', [set(76, 12)])])

  it('760 kg after a best of 76 x 12 is flagged against the estimated 1RM', () => {
    expect(implausibleLoad(past, { id: DB_BENCH, sets: [set(760, 12), set(760, 12, false)] })).toEqual({ w: 760, ref: 106.4, kind: 'rm' })
  })
  it('a real PR is not: a heavier set, a single at the estimated max, up to 1.25 times it', () => {
    expect(implausibleLoad(past, { id: DB_BENCH, sets: [set(80, 10)] })).toBeNull()
    expect(implausibleLoad(past, { id: DB_BENCH, sets: [set(106, 1)] })).toBeNull()
    expect(implausibleLoad(past, { id: DB_BENCH, sets: [set(133, 1)] })).toBeNull()
    expect(implausibleLoad(past, { id: DB_BENCH, sets: [set(134, 1)] })).not.toBeNull()
  })
  it('on light exercises a dumbbell step is not a typo: the gap must be 10 kg too', () => {
    const light = S([workout('2026-05-16', [set(6, 10)])])   // est. 8 kg
    expect(implausibleLoad(light, { id: DB_BENCH, sets: [set(12, 10)] })).toBeNull()
    expect(implausibleLoad(light, { id: DB_BENCH, sets: [set(60, 10)] })).not.toBeNull()
  })
  it('with no history only a load above any human lift is flagged', () => {
    expect(implausibleLoad(S([]), { id: DB_BENCH, sets: [set(300, 5)] })).toBeNull()
    expect(implausibleLoad(S([]), { id: DB_BENCH, sets: [set(2000, 5)] })).toEqual({ w: 2000, ref: 500, kind: 'cap' })
    expect(implausibleLoad(S([], 'lb'), { id: DB_BENCH, sets: [set(1000, 5)] })).toBeNull()
  })
  it('warm-ups and empty rows are ignored; the sides of a unilateral row count', () => {
    expect(topLoadOf({ sets: [{ w: 900, r: 5, warmup: true }, { w: 0, r: 5 }, { sides: { L: { w: 40 }, R: { w: 44 } } }] })).toBe(44)
  })
})
