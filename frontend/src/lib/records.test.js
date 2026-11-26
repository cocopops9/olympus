// Records during a workout (lib/records.js): heaviest weight, best estimated 1RM and most volume,
// against the finished workouts; a first time is a weight record only.
import { describe, expect, it } from 'vitest'
import { recordsOf, newRecords, bestVolumeFor } from './records.js'
import { beatsWeight } from './exercises.js'
import { bestWeightFor } from './history.js'

const BENCH = '0025'
const set = (w, r) => ({ w, r, done: true })
const workout = (d, sets) => ({ id: d, d, start: Date.parse(d + 'T10:00:00'), end: Date.parse(d + 'T11:00:00'), entries: [{ id: BENCH, sets }] })
const S = workouts => ({ unit: 'kg', workouts, exWeights: {}, routines: [], bodyweight: [] })

describe('records', () => {
  const past = S([workout('2026-10-01', [set(80, 5), set(80, 5), set(80, 5)])])
  it('a first time is a weight record, the same as the PR at the finish, and nothing else', () => {
    expect(recordsOf(S([]), { id: BENCH, sets: [set(100, 5)] })).toEqual(['weight'])
    // A 2,000 kg test set on a first time too (the case reported on 2026-11-25).
    expect(recordsOf(S([]), { id: BENCH, sets: [set(2000, 5)] })).toEqual(['weight'])
    // A first time with no load (body weight only) has no weight to be a record of.
    expect(recordsOf(S([]), { id: BENCH, sets: [set(0, 10)] })).toEqual([])
  })
  it('a first time judged with the finish rule: beatsWeight against nothing is a PR', () => {
    expect(beatsWeight(BENCH, 100, bestWeightFor(S([]), BENCH))).toBe(true)
  })
  it('2,000 kg after a history is every record', () => {
    expect(recordsOf(past, { id: BENCH, sets: [set(2000, 5)] })).toEqual(['weight', 'rm', 'volume'])
  })
  it('a heavier set is a weight and 1RM record', () => {
    expect(recordsOf(past, { id: BENCH, sets: [set(85, 5)] })).toEqual(expect.arrayContaining(['weight', 'rm']))
  })
  it('more reps at the same weight: 1RM, not weight', () => {
    const r = recordsOf(past, { id: BENCH, sets: [set(80, 8)] })
    expect(r).toContain('rm')
    expect(r).not.toContain('weight')
  })
  it('volume counts when the session moved more in total', () => {
    expect(bestVolumeFor(past, BENCH)).toBe(1200)
    const e = { id: BENCH, sets: [set(70, 5), set(70, 5), set(70, 5)] }
    expect(recordsOf(past, e)).toEqual([])
    e.sets.push(set(70, 5))
    expect(recordsOf(past, e)).toEqual(['volume'])
  })
  it('warm-ups and unchecked sets do not count; a record is celebrated once', () => {
    expect(recordsOf(past, { id: BENCH, sets: [{ w: 120, r: 5, done: false }, { w: 120, r: 5, done: true, warmup: true }] })).toEqual([])
    expect(newRecords(past, { id: BENCH, sets: [set(85, 5)], rec: ['weight'] })).toEqual(['rm'])
  })
})
