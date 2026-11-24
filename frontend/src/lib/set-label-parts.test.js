import { describe, it, expect } from 'vitest'
import { setLabelParts, isPlainPair } from './set-label-parts.js'

describe('set label parts', () => {
  it('picks out a plain weight×reps set', () => {
    const p = setLabelParts('30×16')
    expect(p).toEqual([{ w: '30', r: '16' }])
    expect(isPlainPair(p)).toBe(true)
  })

  it('keeps locale-formatted weights whole', () => {
    expect(setLabelParts('1.234,5×8')).toEqual([{ w: '1.234,5', r: '8' }])
    expect(setLabelParts('22,5×10')).toEqual([{ w: '22,5', r: '10' }])
    expect(setLabelParts('1 000×1')).toEqual([{ w: '1 000', r: '1' }])
  })

  it('keeps rest-pause bursts with their reps', () => {
    expect(setLabelParts('60×10+4+2')).toEqual([{ w: '60', r: '10+4+2' }])
  })

  it('splits drops, sides and marks around the pairs', () => {
    expect(setLabelParts('100×8 ↘ 80×6')).toEqual([{ w: '100', r: '8' }, { text: ' ↘ ' }, { w: '80', r: '6' }])
    expect(setLabelParts('L 15×8 · R 15×7')).toEqual([{ text: 'L ' }, { w: '15', r: '8' }, { text: ' · R ' }, { w: '15', r: '7' }])
    const failed = setLabelParts('30×16 F')
    expect(failed).toEqual([{ w: '30', r: '16' }, { text: ' F' }])
    expect(isPlainPair(failed)).toBe(false)
  })

  it('leaves labels without a pair as text', () => {
    expect(setLabelParts('12')).toEqual([{ text: '12' }])
    expect(setLabelParts('+10 × 12')).toEqual([{ text: '+10 × 12' }])
    expect(setLabelParts('20 min @ 8 km/h')).toEqual([{ text: '20 min @ 8 km/h' }])
    expect(setLabelParts('')).toEqual([])
    expect(setLabelParts(null)).toEqual([])
  })
})
