import { describe, it, expect } from 'vitest'
import { setLabelParts, isPlainPair, repParts } from './set-label-parts.js'

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

  it('reads bodyweight reps, added weight and dumbbell loads', () => {
    expect(setLabelParts('12')).toEqual([{ r: '12' }])
    expect(setLabelParts('10+4+2')).toEqual([{ r: '10+4+2' }])
    expect(setLabelParts('12 F (RIR 2)')).toEqual([{ r: '12' }, { text: ' F (RIR 2)' }])
    expect(setLabelParts('+10 × 12')).toEqual([{ w: '+10', r: '12' }])
    expect(setLabelParts('+2,5 × 8 ↘ 6')).toEqual([{ w: '+2,5', r: '8' }, { text: ' ↘ ' }, { r: '6' }])
    expect(setLabelParts('20 each × 8')).toEqual([{ w: '20', tag: 'each', r: '8' }])
    expect(setLabelParts('20 cada una × 8')).toEqual([{ w: '20', tag: 'cada una', r: '8' }])
    // Sides keep their translated keys as text; the reps behind them are still reps.
    expect(setLabelParts('L 8 · R 7')).toEqual([{ text: 'L ' }, { r: '8' }, { text: ' · R ' }, { r: '7' }])
    expect(setLabelParts('يسار 8 · يمين 7')).toEqual([{ text: 'يسار ' }, { r: '8' }, { text: ' · يمين ' }, { r: '7' }])
    expect(repParts(setLabelParts('L 8 · R 7'))).toBe(2)
  })

  it('reads cardio, sports and timed sets', () => {
    expect(setLabelParts('5 min @ 12 km/h')).toEqual([{ min: '5', speed: '12', su: 'km/h' }])
    expect(setLabelParts('2:30 min @ 7,5 mph')).toEqual([{ min: '2:30', speed: '7,5', su: 'mph' }])
    expect(setLabelParts('1:05:00 @ 10 km/h')).toEqual([{ clock: '1:05:00', speed: '10', su: 'km/h' }])
    expect(setLabelParts('20 min @ 6 km/h · 5% incline')).toEqual([{ min: '20', speed: '6', su: 'km/h' }, { text: ' · 5% incline' }])
    expect(setLabelParts('90 min')).toEqual([{ min: '90' }])
    expect(setLabelParts('0:45')).toEqual([{ clock: '0:45' }])
    expect(setLabelParts('1:00 · 20 F')).toEqual([{ clock: '1:00', load: '20' }, { text: ' F' }])
  })

  it('leaves the rest as text', () => {
    expect(setLabelParts('45 s')).toEqual([{ text: '45 s' }])
    expect(setLabelParts('')).toEqual([])
    expect(setLabelParts(null)).toEqual([])
  })
})
