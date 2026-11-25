// The stopwatch of a cardio or sport row (lib/stopwatch.js) and what a saved workout keeps of it.
import { describe, expect, it } from 'vitest'
import {
  pauseStopwatch, startStopwatch, stopStopwatch, stopwatchActive, stopwatchPaused, stopwatchRunning, stopwatchSec,
  withoutStopwatch,
} from './stopwatch.js'
import { buildCompletedWorkout } from './finish-workout.js'
import { secsOfMin } from './cardio-time.js'

describe('row stopwatch', () => {
  it('counts up from the tap and writes what it counted as the duration', () => {
    const row = startStopwatch({ min: 20, speed: 8, done: false }, 1000)
    expect(stopwatchRunning(row)).toBe(true)
    expect(stopwatchSec(row, 1000 + 95500)).toBe(95)
    const stopped = stopStopwatch(row, 1000 + 31 * 60000 + 16000)
    expect(stopwatchRunning(stopped)).toBe(false)
    expect('swAt' in stopped).toBe(false)
    expect(secsOfMin(stopped.min)).toBe(31 * 60 + 16)
    expect(stopped.speed).toBe(8)
  })
  it('does not start on a ticked row, nor twice', () => {
    const done = { min: 20, done: true }
    expect(startStopwatch(done, 5)).toBe(done)
    const running = startStopwatch({ min: 20 }, 5)
    expect(startStopwatch(running, 50).swAt).toBe(5)
  })
  it('leaves a row without a running stopwatch as it was', () => {
    const row = { min: 20 }
    expect(stopStopwatch(row, 10)).toBe(row)
    expect(stopwatchSec(row, 10)).toBe(0)
  })
  it('never reads negative, nor past a day', () => {
    expect(stopwatchSec({ swAt: 10000 }, 0)).toBe(0)
    expect(stopwatchSec({ swAt: 0 }, 3 * 86400000)).toBe(24 * 3600 - 1)
  })
  it('pauses without resetting and resumes from the count it held', () => {
    // Start at t=0, run 60 s, pause 30 s, run 45 s more, pause 600 s, run 15 s: 120 s counted.
    let row = startStopwatch({ min: 20, done: false }, 0)
    row = pauseStopwatch(row, 60000)
    expect(stopwatchRunning(row)).toBe(false)
    expect(stopwatchPaused(row)).toBe(true)
    expect(stopwatchActive(row)).toBe(true)
    expect(stopwatchSec(row, 60000)).toBe(60)
    expect(stopwatchSec(row, 89000)).toBe(60) // held while paused
    row = startStopwatch(row, 90000)
    expect(stopwatchRunning(row)).toBe(true)
    expect(stopwatchSec(row, 90000)).toBe(60) // resumes from the held count, not from zero
    expect(stopwatchSec(row, 135000)).toBe(105)
    row = pauseStopwatch(row, 135000)
    row = startStopwatch(row, 735000)
    expect(stopwatchSec(row, 750000)).toBe(120)
    const stopped = stopStopwatch(row, 750000)
    expect(stopwatchActive(stopped)).toBe(false)
    expect('swAt' in stopped || 'swAcc' in stopped).toBe(false)
    expect(secsOfMin(stopped.min)).toBe(120)
  })
  it('keeps sub-second remainders across pauses', () => {
    // Three stretches of 0.6 s add up to 1.8 s: one whole second, not zero.
    let row = { min: 0 }
    for (let k = 0; k < 3; k++) row = pauseStopwatch(startStopwatch(row, k * 10000), k * 10000 + 600)
    expect(stopwatchSec(row)).toBe(1)
  })
  it('stops a paused stopwatch at the count it holds', () => {
    const paused = pauseStopwatch(startStopwatch({ min: 20 }, 0), 75000)
    const stopped = stopStopwatch(paused, 999999999)
    expect(secsOfMin(stopped.min)).toBe(75)
    expect(stopwatchActive(stopped)).toBe(false)
  })
  it('does not pause what is not running', () => {
    const row = { min: 20 }
    expect(pauseStopwatch(row, 10)).toBe(row)
    const paused = pauseStopwatch(startStopwatch(row, 0), 5000)
    expect(pauseStopwatch(paused, 9000)).toBe(paused)
    expect(startStopwatch({ ...paused, done: true }, 9000).swAt).toBeUndefined()
  })
  it('never reaches a saved workout', () => {
    expect(withoutStopwatch({ min: 5, swAt: 1 })).toEqual({ min: 5 })
    expect(withoutStopwatch({ min: 5, swAcc: 1000 })).toEqual({ min: 5 })
    const paused = { id: 'x', d: '2026-11-24', start: 0, name: 'Run', entries: [{ id: 'run', sets: [{ min: 5, swAcc: 9000, done: true }] }] }
    expect(buildCompletedWorkout(paused, { end: 60000 }).entries[0].sets[0].swAcc).toBeUndefined()
    const active = { id: 'x', d: '2026-11-24', start: 0, name: 'Run', entries: [{ id: 'run', sets: [{ min: 5, swAt: 1, done: true }] }] }
    const w = buildCompletedWorkout(active, { end: 60000 })
    expect(w.entries[0].sets[0].swAt).toBeUndefined()
  })
})
