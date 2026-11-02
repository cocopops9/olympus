import { describe, it, expect } from 'vitest'
import { joinChunks, resample, levelled, wavOf, clipOf } from './wav.js'

const bytesOf = async blob => new DataView(await new Response(blob).arrayBuffer())

describe('wav', () => {
  it('joins chunks in order', () => {
    expect(Array.from(joinChunks([new Float32Array([1, 2]), new Float32Array([3])]))).toEqual([1, 2, 3])
  })
  it('resamples 48 kHz to 16 kHz by averaging three samples into one', () => {
    const out = resample(new Float32Array([0, 0.3, 0.6, 1, 1, 1]), 48000, 16000)
    expect(out.length).toBe(2)
    expect(out[0]).toBeCloseTo(0.3, 5)
    expect(out[1]).toBeCloseTo(1, 5)
  })
  it('levels quiet speech up to the cap and leaves loud and silent clips alone', () => {
    const quiet = levelled(new Float32Array([0.05, -0.1]))
    expect(Math.max(...quiet.map(Math.abs))).toBeCloseTo(0.6, 5)   // 6 times up, not 7
    const loud = new Float32Array([0.9])
    expect(levelled(loud)).toBe(loud)
    const silent = new Float32Array([0.001])
    expect(levelled(silent)).toBe(silent)
  })
  it('writes a 16-bit mono WAV with a correct header', async () => {
    const v = await bytesOf(wavOf(new Float32Array([0, 1, -1]), 16000))
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF')
    expect(v.getUint32(24, true)).toBe(16000)
    expect(v.getUint16(22, true)).toBe(1)
    expect(v.getUint32(40, true)).toBe(6)
    expect(v.getInt16(46, true)).toBe(0x7fff)
    expect(v.getInt16(48, true)).toBe(-0x8000)
  })
  it('trims the silence around the speech and gives up on a clip that is too short', async () => {
    const rate = 48000
    const chunk = n => new Float32Array(n).fill(0.4)
    const clip = clipOf([chunk(rate * 10)], rate, { fromMs: 2000, toMs: 4000 })
    const v = await bytesOf(clip)
    // 2000 - 600 to 4000 + 900 ms = 3.5 s at 16 kHz, 16-bit
    expect(v.getUint32(40, true)).toBe(Math.round(3.5 * 16000) * 2)
    expect(clipOf([chunk(1000)], rate)).toBeNull()
    expect(clipOf([], rate)).toBeNull()
  })
})
