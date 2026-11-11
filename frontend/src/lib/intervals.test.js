import { describe, it, expect } from 'vitest'
import { normalizeIntervals, isIntervals, intervalRows, intervalRestFor, intervalMinutes, fmtMinutes } from './intervals.js'
import { buildSets, setsRepsOf } from './history.js'
import { configOf } from './plan-text.js'
import { CATALOGUE, isCardio } from './exercises.js'

// The treadmill HIIT of the plan: 1 min at 12 km/h, 30 s at 17.5, four times, a last minute at
// 12 (7 min), 7 min off, the same again.
const block = rest => [...Array(4)].flatMap(() => [{ min: 1, speed: 12, rest: 0 }, { min: 0.5, speed: 17.5, rest: 0 }]).concat([{ min: 1, speed: 12, rest }])
const HIIT = [...block(420), ...block(0)]

describe('interval cardio', () => {
  it('keeps segments a session can run', () => {
    expect(normalizeIntervals([{ min: 0.5, speed: 17.5, rest: 0 }, { min: 0, speed: 10 }, null, { min: 0.6, speed: 99, rest: -4 }]))
      .toEqual([{ min: 0.5, speed: 17.5, rest: 0 }, { min: 0.5, speed: 40, rest: 0 }])
    expect(isIntervals({ intervals: [] })).toBe(false)
    expect(isIntervals({ intervals: HIIT })).toBe(true)
  })
  it('builds one row per segment, at its length and speed', () => {
    const rows = intervalRows({ intervals: HIIT })
    expect(rows).toHaveLength(18)
    expect(rows.slice(0, 3)).toEqual([{ min: 1, speed: 12, done: false }, { min: 0.5, speed: 17.5, done: false }, { min: 1, speed: 12, done: false }])
    expect(intervalMinutes(HIIT)).toBe(14)
    expect(fmtMinutes(0.5)).toBe('0:30')
  })
  it('rests only where the plan says: 0 between segments, 7 min between the blocks', () => {
    const target = { intervals: HIIT }
    const rows = intervalRows(target)
    expect(intervalRestFor(target, rows, 0)).toBe(0)
    expect(intervalRestFor(target, rows, 8)).toBe(420)
    expect(intervalRestFor(target, rows, 17)).toBe(0)
    expect(intervalRestFor({ sets: 1, min: 20 }, rows, 0)).toBe(null)
  })
  it('a planned session starts at the segments, whatever last time ran', () => {
    const id = CATALOGUE.find(e => /treadmill/i.test(e.n) && isCardio(e))?.id
    const S = { workouts: [{ d: '2026-11-01', entries: [{ id, sets: [{ min: 30, speed: 9, done: true }] }] }], exWeights: {}, unit: 'kg' }
    const sets = buildSets(S, { id, sets: 18, min: 14, speed: 12, intervals: HIIT })
    expect(sets.map(r => r.speed).slice(0, 2)).toEqual([12, 17.5])
    expect(setsRepsOf({ id, intervals: HIIT })).toMatch(/18/)
  })
  it('the coach’s segments become the routine’s', () => {
    const ex = CATALOGUE.find(e => /treadmill/i.test(e.n) && isCardio(e))
    const cfg = configOf({ intervals: HIIT.map(iv => ({ minutes: iv.min, speed: iv.speed, restSec: iv.rest })), restSec: 0 }, ex)
    expect(cfg.intervals).toEqual(HIIT)
    expect(cfg.sets).toBe(18)
  })
  it('the last set to failure is the app’s own flag', () => {
    const ex = CATALOGUE.find(e => e.n === 'lever lateral raise') || CATALOGUE.find(e => !isCardio(e))
    expect(configOf({ sets: 1, reps: 20, repsMin: 12, toFailure: true }, ex).lastToFailure).toBe(true)
    expect(configOf({ sets: 1, reps: 20 }, ex).lastToFailure).toBeUndefined()
  })
})
