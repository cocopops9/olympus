import { describe, it, expect } from 'vitest'
import { setChipOf } from './set-chip.js'
import { makeSideSet } from './workout-model.js'
import { EXDB } from './exercises.js'

const CARDIO = EXDB.find(e => e.bp === 'cardio' && e.eq !== 'body weight').id
const LIFT = EXDB.find(e => e.bp !== 'cardio' && e.eq === 'barbell').id
const BW = EXDB.find(e => e.eq === 'body weight' && e.bp !== 'cardio').id
const DB_BENCH = '0289'   // two bells
const kg = { unit: 'kg' }

describe('setChipOf: a rep set', () => {
  it('names the load and the reps apart, with the unit on the load', () => {
    expect(setChipOf(LIFT, { w: 100, r: 10, done: true }, { id: LIFT, mode: 'reps' }, kg)).toEqual({
      parts: [{ load: { value: '100', unit: 'kg', per: null }, reps: '10' }],
      fail: false, effort: null, warmup: false,
    })
  })
  it('uses the profile unit and keeps a decimal weight', () => {
    const chip = setChipOf(LIFT, { w: 45.3, r: 15 }, { id: LIFT }, { unit: 'lb' })
    expect(chip.parts[0].load).toEqual({ value: '45.3', unit: 'lb', per: null })
  })
  it('gives bodyweight alone no load, and a belt as added weight', () => {
    expect(setChipOf(BW, { w: 0, r: 12 }, { id: BW }, kg).parts).toEqual([{ load: null, reps: '12' }])
    expect(setChipOf(BW, { w: 10, r: 8 }, { id: BW }, kg).parts[0].load).toEqual({ value: '10', unit: 'kg', per: '+' })
  })
  it('says whether a pair of dumbbells is each or total, as the history line does', () => {
    expect(setChipOf(DB_BENCH, { w: 20, r: 8 }, { id: DB_BENCH, dbLoad: 'each' }, kg).parts[0].load.per).toBe('each')
    expect(setChipOf(DB_BENCH, { w: 40, r: 8 }, { id: DB_BENCH, dbLoad: 'total' }, kg).parts[0].load.per).toBe('total')
  })
  it('lists the drops of a drop-set as parts after the set', () => {
    const s = { w: 100, r: 8, type: 'dropset', drops: [{ w: 80, r: 6 }, { w: 60, r: 0 }] }
    expect(setChipOf(LIFT, s, { id: LIFT, mode: 'reps' }, kg).parts.map(p => [p.load.value, p.reps]))
      .toEqual([['100', '8'], ['80', '6']])   // a drop with no reps was not done
  })
  it('reads a rest-pause set as its bursts', () => {
    const s = { w: 60, r: 16, type: 'restpause', clusters: [{ r: 4 }, { r: 2 }] }
    expect(setChipOf(LIFT, s, { id: LIFT, mode: 'reps' }, kg).parts[0].reps).toBe('10+4+2')
  })
  it('carries failure and effort', () => {
    const chip = setChipOf(LIFT, { w: 60, r: 5, failure: true, rpe: 9 }, { id: LIFT }, kg)
    expect([chip.fail, chip.effort, chip.warmup]).toEqual([true, 'RPE 9', false])
  })
  it('marks a warm-up, which is never a set to failure', () => {
    const chip = setChipOf(LIFT, { w: 40, r: 10, failure: true, phase: 'warmup' }, { id: LIFT }, kg)
    expect([chip.fail, chip.warmup]).toEqual([false, true])
  })
})

describe('setChipOf: sets that keep their line', () => {
  it('a cardio set', () => {
    expect(setChipOf(CARDIO, { min: 20, speed: 8 }, { id: CARDIO, mode: 'cardio' }, { unit: 'kg', speedUnit: 'kmh' }))
      .toEqual({ text: '20 min @ 8 km/h' })
  })
  it('a timed set', () => {
    expect(setChipOf(LIFT, { sec: 45 }, { id: LIFT, mode: 'time' }, kg)).toEqual({ text: '0:45' })
  })
  it('a set logged per side', () => {
    const s = makeSideSet({ w: 15, r: 8, done: true })
    expect(setChipOf(LIFT, s, { id: LIFT, mode: 'reps' }, kg).text).toMatch(/^L .* · R /)
  })
})
