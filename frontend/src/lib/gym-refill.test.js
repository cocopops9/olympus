import { describe, expect, test } from 'vitest'
import { refillUndone, changeSessionGym } from './gym-refill.js'
import { recordsOf } from './records.js'
import { recordHistory } from './gyms.js'

const done = (w, r) => ({ w, r, done: true })
const open = (w, r) => ({ w, r, done: false })
const workout = (id, gym, end, entries) => ({ id, d: new Date(end).toISOString().slice(0, 10), start: end - 3600000, end, entries, ...(gym ? { gym } : {}) })

describe('refillUndone', () => {
  test('only the sets not ticked take the new numbers, by place among work sets and warm-ups', () => {
    const cur = [{ w: 20, r: 10, done: false, warmup: true }, done(84, 9), open(84, 9), open(84, 9)]
    const fresh = [{ w: 25, r: 10, warmup: true }, { w: 50, r: 12 }, { w: 54, r: 12 }, { w: 59, r: 12 }]
    const out = refillUndone(cur, fresh)
    expect(out[0]).toMatchObject({ w: 25, r: 10, warmup: true })
    expect(out[1]).toBe(cur[1])
    expect(out.slice(2).map(s => [s.w, s.r])).toEqual([[54, 12], [59, 12]])
    // The new numbers are a suggestion, faded until changed or ticked (lib/suggested.js).
    expect(out[2].sug).toEqual(['w', 'r'])
  })

  test('a row with no counterpart, or the same numbers, is left exactly as it was', () => {
    const cur = [open(50, 12), open(50, 12)]
    const out = refillUndone(cur, [{ w: 50, r: 12 }])
    expect(out[0]).toBe(cur[0])
    expect(out[1]).toBe(cur[1])
  })
})

describe('changing the gym in the middle of a workout', () => {
  const press = sets => ({ id: '2962', sets })
  const S = () => ({
    unit: 'kg',
    routines: [],
    workouts: [
      workout('conde', 'Conde', 1e12, [press([done(50, 12), done(54, 12), done(59, 12)])]),
      workout('cdb', 'CdB', 2e12, [press([done(77, 12), done(84, 9), done(77, 12)])]),
    ],
    active: { d: '2026-11-25', start: 3e12, entries: [{ id: '2962', target: { id: '2962', mode: 'reps', sets: 3, reps: 12 }, sets: [done(77, 12), open(84, 9), open(77, 12)] }] },
  })

  test('the unticked sets take the last session in the new gym; the ticked one stays', () => {
    const s = S()
    expect(changeSessionGym(s, 'Conde')).toBe(1)
    expect(s.active.gym).toBe('Conde')
    expect(s.active.entries[0].sets.map(x => [x.w, x.r, !!x.done])).toEqual([[77, 12, true], [54, 12, false], [59, 12, false]])
  })

  test('picking the gym already in use changes nothing', () => {
    const s = S()
    s.active.gym = 'CdB'
    const before = s.active.entries[0].sets
    expect(changeSessionGym(s, 'CdB')).toBe(0)
    expect(s.active.entries[0].sets).toBe(before)
  })

  test('a saved workout being edited only changes its label', () => {
    const s = S()
    s.active.editingWorkoutId = 'cdb'
    expect(changeSessionGym(s, 'Conde')).toBe(0)
    expect(s.active.entries[0].sets[1].w).toBe(84)
  })
})

describe('records per gym against a history mostly without gyms', () => {
  // Today's lateral raise at Conde de Casal: better than every session there, not than the best
  // of the years logged before gyms could be labelled.
  const raise = sets => ({ id: '0584', sets })
  const S = {
    recordsByGym: true,
    workouts: [
      workout('old', null, 1e12, [raise([done(70, 15), done(70, 15), done(70, 15), done(70, 15)])]),
      workout('c1', 'Conde', 2e12, [raise([done(32, 12), done(52, 12), done(52, 10), done(52, 9)])]),
      workout('c2', 'Conde', 3e12, [raise([done(45, 15), done(50, 15), done(50, 13)])]),
    ],
  }
  const today = raise([done(50, 18), done(50, 18), done(50, 17), done(50, 17)])

  test('held only against the same gym, the day sets its records', () => {
    expect(recordsOf(recordHistory(S, 'Conde'), today)).toContain('volume')
  })

  test('with the option off, the whole history still counts', () => {
    expect(recordsOf(recordHistory({ ...S, recordsByGym: false }, 'Conde'), today)).toEqual([])
  })
})
