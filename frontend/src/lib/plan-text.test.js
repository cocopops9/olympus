// A workout or plan written as text (lib/plan-text.js): the names the coach wrote matched to the
// catalogue, the draft the sheet shows, and what saving it does to the plan.
import { describe, it, expect } from 'vitest'
import { matchExercise, configOf, draftOf, pickFor, draftIssues, routineOf, saveDraft, takenDays, draftUsable } from './plan-text.js'
import { EXIDX } from './exercises.js'

const ex = (name, more = {}) => ({ name, sets: 3, reps: 10, repsMin: 0, weight: 0, seconds: 0, minutes: 0, superset: '', note: '', ...more })

describe('matching the names the coach wrote', () => {
  it('finds the classic version when no equipment is named, and the exact one when it is', () => {
    expect(matchExercise('barbell bench press').ex.id).toBe('0025')
    expect(matchExercise('bench press').ex.n).toBe('barbell bench press')
    expect(matchExercise('dumbbell lateral raise')).toEqual({ ex: EXIDX['0334'], sure: true })
    expect(matchExercise('leg press').ex.n).toBe('sled 45° leg press')
    expect(matchExercise('Pull-up').ex.n).toBe('pull-up')
  })
  it('prefers the person\'s own exercise of that name', () => {
    const mine = { id: 'c_1', n: 'my band row', bp: 'back', eq: 'band' }
    expect(matchExercise('My band row', [mine]).ex).toBe(mine)
  })
  it('marks a rough match as one to check, and gives up on nonsense', () => {
    const m = matchExercise('barbell zercher squat deluxe')
    if (m) expect(m.sure).toBe(false)
    expect(matchExercise('')).toBeNull()
    expect(matchExercise('qqqqzzzz xxyyww')).toBeNull()
  })
})

describe('the routine configuration', () => {
  it('reps with a range and a weight, holds, and cardio', () => {
    const bench = EXIDX['0025']
    expect(configOf(ex('x', { sets: 4, reps: 8, repsMin: 6, weight: 80 }), bench)).toMatchObject({ sets: 4, reps: 8, repsMin: 6, weight: 80, mode: 'reps' })
    expect(configOf(ex('x', { reps: 10, repsMin: 10 }), bench).repsMin).toBeUndefined()
    const plank = matchExercise('plank').ex
    expect(configOf(ex('plank', { sets: 3, reps: 0, seconds: 45 }), plank)).toMatchObject({ mode: 'time', sets: 3, sec: 45 })
    const tread = matchExercise('run on treadmill').ex
    expect(configOf(ex('run', { sets: 1, reps: 0, minutes: 25 }), tread)).toMatchObject({ sets: 1, min: 25 })
  })
})

const PLAN = {
  kind: 'plan', name: 'PPL', comment: 'I guessed the weights.',
  routines: [
    { name: 'Push', days: [1, 4], exercises: [ex('barbell bench press', { sets: 4, reps: 8, weight: 80, note: 'RPE 8' }), ex('dumbbell lateral raise', { superset: 'A' }), ex('cable triceps pushdown (v-bar)', { superset: 'A' }), ex('qqqqzzzz xxyyww', { superset: 'B' })] },
    { name: 'Pull', days: [2], exercises: [ex('pull-up', { sets: 4, reps: 8 })] },
  ],
}

describe('the draft', () => {
  it('matches every exercise, links supersets of neighbours only, and counts what is missing', () => {
    const d = draftOf(PLAN)
    expect(d.kind).toBe('plan')
    expect(d.comment).toBe('I guessed the weights.')
    const [bench, raise, push, odd] = d.routines[0].items
    expect(bench.ex.id).toBe('0025')
    expect(bench.note).toBe('RPE 8')
    expect(raise.sg).toBeTruthy()
    expect(push.sg).toBe(raise.sg)
    expect(odd.ex).toBeNull()
    expect(odd.sg).toBe('')      // a lone "B" is no superset
    expect(draftIssues(d).missing).toBe(1)
    expect(draftUsable(d)).toBe(true)
  })
  it('one session is a workout', () => {
    expect(draftOf({ kind: 'workout', routines: [PLAN.routines[1]] }).kind).toBe('workout')
    expect(draftOf({ kind: 'workout', routines: PLAN.routines }).kind).toBe('plan')
  })
  it('an exercise picked for an item keeps the sets and reps the coach read', () => {
    const d = draftOf(PLAN)
    const odd = d.routines[0].items[3]
    const picked = pickFor(odd, EXIDX['0025'])
    expect(picked.ex.id).toBe('0025')
    expect(picked.sure).toBe(true)
    expect(picked.cfg).toMatchObject({ sets: 3, reps: 10 })
  })
  it('a routine leaves out what has no exercise, and a superset left alone', () => {
    const d = draftOf(PLAN)
    d.routines[0].items[2] = { ...d.routines[0].items[2], ex: null }   // the pushdown, gone
    const r = routineOf(d.routines[0])
    expect(r.ex.map(e => e.id)).toEqual(['0025', '0334'])
    expect(r.ex[1].sg).toBeUndefined()
    expect(r.ex[0]).toMatchObject({ sets: 4, reps: 8, weight: 80, note: 'RPE 8' })
    expect(r.name).toBe('Push')
  })
})

describe('saving', () => {
  it('adds the routines after yours and puts them on their weekdays, replacing only those days', () => {
    const s = { routines: [{ id: 'mine', name: 'Legs', ex: [] }], week: { 1: ['mine'], 3: ['mine'] } }
    const d = draftOf(PLAN)
    expect(takenDays(s, d)).toEqual([1])
    const ids = saveDraft(s, d)
    expect(ids).toHaveLength(2)
    expect(s.routines.map(r => r.name)).toEqual(['Legs', 'Push', 'Pull'])
    expect(s.week[1]).toEqual([ids[0]])
    expect(s.week[4]).toEqual([ids[0]])
    expect(s.week[2]).toEqual([ids[1]])
    expect(s.week[3]).toEqual(['mine'])
  })
  it('without the schedule, only the routines', () => {
    const s = { routines: [], week: { 1: ['x'] } }
    saveDraft(s, draftOf(PLAN), { schedule: false })
    expect(s.routines).toHaveLength(2)
    expect(s.week).toEqual({ 1: ['x'] })
  })
  it('two routines of the draft on one day share it, and an empty routine is not saved', () => {
    const s = { routines: [], week: {} }
    const d = draftOf({ routines: [{ name: 'A', days: [5], exercises: [ex('pull-up')] }, { name: 'B', days: [5], exercises: [ex('plank', { reps: 0, seconds: 30 })] }, { name: 'C', days: [6], exercises: [ex('qqqqzzzz xxyyww')] }] })
    const ids = saveDraft(s, d)
    expect(ids).toHaveLength(2)
    expect(s.week[5]).toEqual(ids)
    expect(s.week[6]).toBeUndefined()
  })
})
