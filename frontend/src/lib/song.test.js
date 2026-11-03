// The part of a song to share (lib/song.js): the range kept in bounds, the bit rate that keeps a
// whole song under the server's limit, and a real MP3 coming out of the encoder.
import { describe, it, expect, vi } from 'vitest'
import { defaultRange, wholeRange, clampRange, bitrateFor, rateFor, encodeMp3, MAX_BYTES, MAX_SONG_SEC, MIN_CLIP_SEC, titleFromFile } from './song.js'

// An AudioBuffer stand-in: stereo, 44.1 kHz, a few sine waves so the encoder has music to chew on.
function fake(seconds, rate = 44100) {
  const length = Math.round(seconds * rate)
  const chans = [new Float32Array(length), new Float32Array(length)]
  for (let i = 0; i < length; i++) {
    const v = 0.4 * Math.sin(i * 0.031) + 0.2 * Math.sin(i * 0.17) + 0.1 * Math.sin(i * 0.53)
    chans[0][i] = v; chans[1][i] = v * 0.9
  }
  return { sampleRate: rate, length, duration: seconds, numberOfChannels: 2, getChannelData: c => chans[c] }
}

describe('the range of a song', () => {
  it('starts as 30 seconds from a third of the way in, or the whole of a short song', () => {
    expect(defaultRange(200)).toEqual({ start: 67, end: 97 })
    expect(defaultRange(20)).toEqual({ start: 0, end: 20 })
    expect(defaultRange(35)).toEqual({ start: 5, end: 35 })   // a third in would run past the end: it is moved back
  })
  it('the whole song, or its first six minutes', () => {
    expect(wholeRange(215.6)).toEqual({ start: 0, end: 215.6 })
    expect(wholeRange(900)).toEqual({ start: 0, end: MAX_SONG_SEC })
  })
  it('keeps both ends inside the song, at least 3 seconds apart and at most six minutes', () => {
    expect(clampRange(200, { start: 50, end: 51 }, 'end')).toEqual({ start: 50, end: 50 + MIN_CLIP_SEC })
    expect(clampRange(200, { start: 199, end: 150 }, 'start')).toEqual({ start: 147, end: 150 })
    expect(clampRange(200, { start: -5, end: 900 }, 'end')).toEqual({ start: 0, end: 200 })
    expect(clampRange(1000, { start: 100, end: 900 }, 'end')).toEqual({ start: 540, end: 900 })
    expect(clampRange(1000, { start: 100, end: 900 }, 'start')).toEqual({ start: 100, end: 100 + MAX_SONG_SEC })
    expect(clampRange(2, { start: 0, end: 2 }, 'end')).toEqual({ start: 0, end: 2 })   // a clip shorter than the minimum
  })
})

describe('the bit rate', () => {
  it('is as high as it can be while the file stays under the limit', () => {
    expect(bitrateFor(30)).toBe(128)
    expect(bitrateFor(200)).toBe(96)
    expect(bitrateFor(240)).toBe(80)
    expect(bitrateFor(300)).toBe(64)
    expect(bitrateFor(MAX_SONG_SEC)).toBe(48)
    for (const s of [5, 30, 90, 180, 240, 300, MAX_SONG_SEC]) expect(s * bitrateFor(s) * 125).toBeLessThanOrEqual(MAX_BYTES)
  })
  it('runs the encoder at 32 kHz from 64 kbit/s up and 24 kHz below', () => {
    expect([rateFor(128), rateFor(64), rateFor(56), rateFor(48)]).toEqual([32000, 32000, 24000, 24000])
  })
})

describe('the MP3', () => {
  it('is a real Layer III stream of the right size, and the progress reaches the end', async () => {
    const onProgress = vi.fn()
    const bytes = await encodeMp3(fake(12), 2, 10, { onProgress })
    expect(bytes[0]).toBe(0xff)
    expect(bytes[1] & 0xe0).toBe(0xe0)             // frame sync
    expect((bytes[1] >> 1) & 3).toBe(1)            // Layer III
    expect(bytes.length).toBeGreaterThan(8 * 128 * 125 * 0.9)
    expect(bytes.length).toBeLessThan(8 * 128 * 125 * 1.1)
    expect(onProgress).toHaveBeenCalled()
    expect(onProgress.mock.calls.at(-1)[0]).toBe(1)
  })
  it('keeps even six minutes under the limit the server takes', async () => {
    const bytes = await encodeMp3(fake(MAX_SONG_SEC + 20), 0, MAX_SONG_SEC + 20)   // asked for more: cut to six minutes
    expect(bytes.length).toBeLessThanOrEqual(MAX_BYTES)
    expect(bytes.length).toBeGreaterThan(MAX_SONG_SEC * 48 * 125 * 0.9)
  }, 60000)
})

describe('the title', () => {
  it('comes from the file name', () => {
    expect(titleFromFile('02 - Eye of the Tiger.mp3')).toBe('Eye of the Tiger')
  })
})
