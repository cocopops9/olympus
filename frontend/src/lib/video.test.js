// Olympus: the short video of a post (lib/video.js): what is shrunk, to what, and when a file
// goes up untouched.
import { describe, expect, it } from 'vitest'
import { videoBitrateFor, sizeFor, pickMime, goesAsIs, defaultVideoRange, MAX_VIDEO_BYTES, MAX_VIDEO_SEC } from './video.js'

describe('video bit rate', () => {
  it('keeps video and sound under the limit for any length up to 30 seconds', () => {
    for (const s of [1, 5, 10, 15, 20, 30]) {
      const bytes = (videoBitrateFor(s) + 64000) * s / 8
      expect(bytes, s + ' s').toBeLessThanOrEqual(MAX_VIDEO_BYTES)
    }
  })
  it('falls as the clip gets longer, within sensible bounds', () => {
    expect(videoBitrateFor(5)).toBeGreaterThan(videoBitrateFor(30))
    expect(videoBitrateFor(1)).toBeLessThanOrEqual(1_400_000)
    expect(videoBitrateFor(30)).toBeGreaterThanOrEqual(250_000)
  })
})

describe('video size', () => {
  it('scales a 1080p portrait phone video down to 480 x 854', () => {
    expect(sizeFor(1080, 1920)).toEqual({ w: 480, h: 854 })
  })
  it('scales a 1080p landscape one down to 854 x 480', () => {
    expect(sizeFor(1920, 1080)).toEqual({ w: 854, h: 480 })
  })
  it('never makes a small video larger, and keeps the sides even', () => {
    expect(sizeFor(320, 240)).toEqual({ w: 320, h: 240 })
    const { w, h } = sizeFor(1001, 777)
    expect(w % 2).toBe(0); expect(h % 2).toBe(0)
  })
})

describe('recorder format', () => {
  const only = ok => ({ isTypeSupported: m => ok.some(x => m.startsWith(x)) })
  it('prefers MP4, then WebM, and says null where there is no recorder', () => {
    expect(pickMime(only(['video/mp4', 'video/webm']))).toMatch(/^video\/mp4/)
    expect(pickMime(only(['video/webm']))).toBe('video/webm;codecs=vp9,opus')
    expect(pickMime(only([]))).toBe(null)
    expect(pickMime(null)).toBe(null)
  })
})

describe('what goes up as it is', () => {
  const file = (type, size) => ({ type, size })
  const whole = d => ({ start: 0, end: d })
  it('a small MP4 or WebM, 30 seconds or less, kept whole', () => {
    expect(goesAsIs(file('video/mp4', 1_000_000), 12, whole(12))).toBe(true)
    expect(goesAsIs(file('video/webm', 2_000_000), 30, whole(30))).toBe(true)
  })
  it('not when it is large, long, cut, or a format the server does not keep', () => {
    expect(goesAsIs(file('video/mp4', 20_000_000), 12, whole(12))).toBe(false)
    expect(goesAsIs(file('video/mp4', 1_000_000), 45, whole(45))).toBe(false)
    expect(goesAsIs(file('video/mp4', 1_000_000), 12, { start: 2, end: 12 })).toBe(false)
    expect(goesAsIs(file('video/mp4', 1_000_000), 12, { start: 0, end: 8 })).toBe(false)
    expect(goesAsIs(file('video/x-matroska', 1_000_000), 12, whole(12))).toBe(false)
    expect(goesAsIs(null, 12, whole(12))).toBe(false)
  })
})

describe('the part to start from', () => {
  it('is the first 30 seconds, or all of a shorter video', () => {
    expect(defaultVideoRange(12)).toEqual({ start: 0, end: 12 })
    expect(defaultVideoRange(95)).toEqual({ start: 0, end: MAX_VIDEO_SEC })
    expect(defaultVideoRange(0)).toEqual({ start: 0, end: 0 })
  })
})
