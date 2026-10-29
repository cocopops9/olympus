import { describe, expect, it } from 'vitest'
import { tapWake, restAdvice, quickTips, isCompound, WAKE_WINDOW_MS } from './chiron.js'

describe('Chiron wakes up', () => {
  it('after three quick taps, and not after taps far apart', () => {
    let s = null
    s = tapWake(s, 0); expect(s).toMatchObject({ taps: 1, awake: false })
    s = tapWake(s, 400); expect(s.awake).toBe(false)
    s = tapWake(s, 800); expect(s.awake).toBe(true)
    let slow = tapWake(null, 0)
    slow = tapWake(slow, WAKE_WINDOW_MS + 1)
    slow = tapWake(slow, 2 * WAKE_WINDOW_MS + 2)
    expect(slow).toMatchObject({ taps: 1, awake: false })
    // Awake, the count starts again for the next time he falls asleep.
    expect(tapWake(s, 900).taps).toBe(1)
  })
})

describe('rest between sets', () => {
  it('follows the evidence-based ranges for the rep range and the kind of lift', () => {
    expect(restAdvice({ reps: 3, compound: true })).toMatchObject({ low: 180, high: 300, why: 'strength' })
    expect(restAdvice({ reps: 8, compound: true })).toMatchObject({ sec: 150, low: 120, high: 180, why: 'hypertrophy-compound' })
    expect(restAdvice({ reps: 12, compound: false })).toMatchObject({ sec: 90, low: 60, high: 120, why: 'hypertrophy-isolation' })
    expect(restAdvice({ reps: 20 })).toMatchObject({ low: 30, high: 90, why: 'endurance' })
    expect(restAdvice({ mode: 'time' }).why).toBe('timed')
  })
  it('lets the goals pick inside the range, and failure take the long end, never past it', () => {
    const plain = restAdvice({ reps: 8, compound: true })
    const strong = restAdvice({ reps: 8, compound: true, styles: ['powerlifting'] })
    expect(strong.sec).toBeGreaterThan(plain.sec)
    expect(strong.sec).toBeLessThanOrEqual(strong.high)
    expect(restAdvice({ reps: 5, compound: true, styles: ['strength'], failure: true }).sec).toBe(300)
    expect(restAdvice({ reps: 12, styles: ['endurance'] }).why).toBe('endurance')
    for (const reps of [1, 3, 5, 6, 10, 12, 15, 30]) for (const compound of [true, false]) {
      const a = restAdvice({ reps, compound, failure: true })
      expect(a.sec % 15).toBe(0)
      expect(a.sec).toBeGreaterThanOrEqual(a.low); expect(a.sec).toBeLessThanOrEqual(a.high)
    }
  })
  it('tells a compound lift from an isolation one by the muscles it works', () => {
    expect(isCompound({ sm: ['triceps', 'delts'] })).toBe(true)
    expect(isCompound({ sm: ['forearms'] })).toBe(false)
    expect(isCompound({ sm: ['a', 'b'], cat: 'stretching' })).toBe(false)
  })
})

describe('the first thing he says', () => {
  const S = {
    active: {
      cur: 1,
      entries: [
        { id: 'a', sets: [{ w: 60, r: 8, done: true }] },
        { id: 'b', sets: [{ w: 40, r: 10, warm: true }, { w: 100, r: 5, done: true, f: true }, { w: 100, r: 5 }, { w: 100, r: 5 }] },
      ],
    },
  }
  const exOf = id => (id === 'b' ? { id, sm: ['glutes', 'hamstrings'] } : null)
  it('is the next set as planned and the rest before it', () => {
    const tip = quickTips(S, { exOf })
    expect(tip.next).toMatchObject({ w: 100, r: 5 })
    expect(tip.left).toBe(2)
    // 5 reps on a compound lift, the last one to failure: the long end of 3 to 5 min.
    expect(tip.rest).toMatchObject({ why: 'strength', sec: 270 })
  })
  it('says the exercise is done, and nothing without a workout', () => {
    const done = { active: { cur: 0, entries: [{ id: 'a', sets: [{ w: 60, r: 8, done: true }] }] } }
    expect(quickTips(done).next).toBe(null)
    expect(quickTips({ active: null })).toBe(null)
  })
})
