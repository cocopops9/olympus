// recordSignature (lib/records.js): the string views/Workout.jsx compares to know that a ticked
// set changed after its tick and its records have to be judged again.
import { describe, expect, it } from 'vitest'
import { recordSignature } from './records.js'

const sideRow = (L, R) => ({ w: Math.max(L.w, R.w), r: L.r + R.r, done: L.done && R.done, sides: { L, R } })

describe('recordSignature', () => {
  it('changes with the weight or the reps of a ticked row', () => {
    const e = { id: 'x', sets: [{ w: 70, r: 5, done: true }] }
    const before = recordSignature(e)
    expect(recordSignature({ ...e, sets: [{ w: 80, r: 5, done: true }] })).not.toBe(before)
    expect(recordSignature({ ...e, sets: [{ w: 70, r: 6, done: true }] })).not.toBe(before)
  })

  it('ignores rows not ticked yet: typing a plan is no record', () => {
    const e = { id: 'x', sets: [{ w: 70, r: 5, done: true }, { w: 70, r: 5, done: false }] }
    const typed = { id: 'x', sets: [{ w: 70, r: 5, done: true }, { w: 100, r: 5, done: false }] }
    expect(recordSignature(typed)).toBe(recordSignature(e))
  })

  it('sees the lighter side of a unilateral row, which the row aggregate hides', () => {
    // The row carries the heavier side's weight; raising the lighter one leaves it unchanged.
    const a = { id: 'x', sets: [sideRow({ w: 20, r: 8, done: true }, { w: 16, r: 8, done: true })] }
    const b = { id: 'x', sets: [sideRow({ w: 20, r: 8, done: true }, { w: 18, r: 8, done: true })] }
    expect(b.sets[0].w).toBe(a.sets[0].w)
    expect(recordSignature(b)).not.toBe(recordSignature(a))
  })

  it('sees a drop set\'s drops', () => {
    const a = { id: 'x', sets: [{ w: 60, r: 8, done: true, type: 'dropset', drops: [{ w: 40, r: 8 }] }] }
    const b = { id: 'x', sets: [{ w: 60, r: 8, done: true, type: 'dropset', drops: [{ w: 40, r: 10 }] }] }
    expect(recordSignature(b)).not.toBe(recordSignature(a))
  })

  it('does not change for the time of the tick or where a weight came from', () => {
    const a = { id: 'x', sets: [{ w: 70, r: 5, done: true, at: 1 }] }
    const b = { id: 'x', sets: [{ w: 70, r: 5, done: true, at: 2, weightOrigin: 'manual' }] }
    expect(recordSignature(b)).toBe(recordSignature(a))
  })
})
