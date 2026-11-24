// The stopwatch of a cardio or sport row (lib/stopwatch.js) and what a saved workout keeps of it.
import { describe, expect, it } from 'vitest'
import { startStopwatch, stopStopwatch, stopwatchRunning, stopwatchSec, withoutStopwatch } from './stopwatch.js'
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
  it('never reaches a saved workout', () => {
    expect(withoutStopwatch({ min: 5, swAt: 1 })).toEqual({ min: 5 })
    const active = { id: 'x', d: '2026-11-24', start: 0, name: 'Run', entries: [{ id: 'run', sets: [{ min: 5, swAt: 1, done: true }] }] }
    const w = buildCompletedWorkout(active, { end: 60000 })
    expect(w.entries[0].sets[0].swAt).toBeUndefined()
  })
})
