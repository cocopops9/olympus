// The workout clock (lib/workout-clock.js), suggested numbers (lib/suggested.js) and picking a
// finished workout up again (lib/session-edit.js resumeCompletedSession).
import { describe, expect, it } from 'vitest'
import { elapsedOf, pauseClock, resumeClock, setElapsed, trainedEnd, fmtClock, isPaused } from './workout-clock.js'
import { markSuggested, isSuggested, clearSuggested } from './suggested.js'
import { resumeCompletedSession } from './session-edit.js'
import { buildCompletedWorkout } from './finish-workout.js'

const MIN = 60000

describe('workout clock', () => {
  it('a pause stops the time and leaves the total out', () => {
    const a = { start: 0 }
    expect(elapsedOf(a, 10 * MIN)).toBe(10 * MIN)
    pauseClock(a, 10 * MIN)
    expect(isPaused(a)).toBe(true)
    expect(elapsedOf(a, 25 * MIN)).toBe(10 * MIN)
    resumeClock(a, 25 * MIN)
    expect(a.pausedMs).toBe(15 * MIN)
    expect(elapsedOf(a, 30 * MIN)).toBe(15 * MIN)
  })
  it('setting the time moves the start, running or paused', () => {
    const a = { start: 0, pausedMs: 5 * MIN }
    setElapsed(a, 40 * MIN, 60 * MIN)
    expect(elapsedOf(a, 60 * MIN)).toBe(40 * MIN)
    pauseClock(a, 70 * MIN)
    setElapsed(a, 20 * MIN, 90 * MIN)
    expect(elapsedOf(a, 90 * MIN)).toBe(20 * MIN)
  })
  it('the saved end leaves the pauses out and stops at a pause still on', () => {
    expect(trainedEnd({ start: 0, pausedMs: 10 * MIN }, 60 * MIN)).toBe(50 * MIN)
    expect(trainedEnd({ start: 0, pausedAt: 30 * MIN }, 60 * MIN)).toBe(30 * MIN)
    expect(trainedEnd({ start: 0, pausedMs: 90 * MIN }, 60 * MIN)).toBe(0)
  })
  it('reads as m:ss, with hours past one', () => {
    expect(fmtClock(65000)).toBe('1:05')
    expect(fmtClock(3723000)).toBe('1:02:03')
  })
})

describe('suggested numbers', () => {
  it('rows not done are marked in the fields they have; editing or ticking clears them', () => {
    const [a, b] = markSuggested([{ w: 60, r: 8, done: false }, { w: 60, r: 8, done: true }])
    expect(isSuggested(a, 'w')).toBe(true)
    expect(b.sug).toBeUndefined()
    clearSuggested(a, 'w')
    expect(isSuggested(a, 'w')).toBe(false)
    expect(isSuggested(a, 'r')).toBe(true)
    clearSuggested(a)
    expect(a.sug).toBeUndefined()
  })
  it('never reaches a finished workout', () => {
    const active = { id: 'x', d: '2026-10-26', start: 0, name: 'W', entries: [{ id: '0025', sets: markSuggested([{ w: 60, r: 8, done: false }]).map(s => ({ ...s, done: true })) }] }
    const w = buildCompletedWorkout(active, { end: MIN })
    expect(w.entries[0].sets[0].sug).toBeUndefined()
  })
})

describe('resume a finished workout', () => {
  const saved = { id: 'w1', d: '2026-10-26', start: 0, end: 45 * MIN, name: 'Push', vol: 100, prs: ['0025'], _ts: 5,
    entries: [{ id: '0025', sets: [{ w: 60, r: 8, done: true }] }, { id: '0030', sets: [{ w: 20, r: 10, done: true }, { w: 20, r: 10, done: false }] }] }
  it('becomes the running session, the clock carrying on from its time', () => {
    const state = { workouts: [saved], active: null, workoutView: 'list' }
    const a = resumeCompletedSession(state, saved, 120 * MIN)
    expect(state.active).toBe(a)
    expect(a.resumeOf).toBe('w1')
    expect(a.cur).toBe(1)
    expect(elapsedOf(a, 120 * MIN)).toBe(45 * MIN)
    expect(a.vol).toBeUndefined()
    expect(a.end).toBeUndefined()
    expect(state.workouts).toHaveLength(1)
  })
  it('not while another session runs', () => {
    expect(() => resumeCompletedSession({ workouts: [saved], active: { id: 'x' } }, saved)).toThrow()
  })
})
