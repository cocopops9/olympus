import { describe, expect, it } from 'vitest'
import { secsOfMin, minOfSecs, splitHms, joinHms, isWholeMinutes, fmtClock, fmtCardioMin, CARDIO_MAX_SEC } from './cardio-time.js'

describe('cardio durations with seconds', () => {
  it('one hour, thirty minutes and sixteen seconds survives the trip through minutes', () => {
    const sec = joinHms(1, 30, 16)
    expect(sec).toBe(5416)
    const min = minOfSecs(sec)
    expect(secsOfMin(min)).toBe(5416)
    expect(splitHms(secsOfMin(min))).toEqual({ h: 1, m: 30, s: 16 })
  })

  it('every second of a minute comes back as typed after the 2-decimal rounding a stepper applies', () => {
    for (let s = 0; s < 60; s++) {
      const min = Math.round(minOfSecs(30 * 60 + s) * 100) / 100
      expect(secsOfMin(min)).toBe(30 * 60 + s)
    }
  })

  it('a mix beyond the clock is carried over: 90 minutes and 75 seconds', () => {
    expect(joinHms(0, 90, 75)).toBe(5475)
    expect(joinHms(0, 0, 0)).toBe(0)
    expect(joinHms(-1, 'x', null)).toBe(0)
    expect(joinHms(48, 0, 0)).toBe(CARDIO_MAX_SEC)
  })

  it('whole minutes read exactly as before; seconds show as a clock', () => {
    expect(isWholeMinutes(30)).toBe(true)
    expect(isWholeMinutes(30.5)).toBe(false)
    expect(fmtCardioMin(30)).toBe('30 min')
    expect(fmtCardioMin(90)).toBe('90 min')
    expect(fmtCardioMin(30.2667)).toBe('30:16 min')
    expect(fmtCardioMin(minOfSecs(5416))).toBe('1:30:16')
    expect(fmtClock(1.5)).toBe('1:30')
    expect(fmtClock(minOfSecs(3605))).toBe('1:00:05')
  })

  it('junk reads as zero', () => {
    expect(secsOfMin(undefined)).toBe(0)
    expect(fmtCardioMin(null)).toBe('0 min')
  })
})
