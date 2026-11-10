// A workout or plan written as text (lib/plan-text.js): the names the coach wrote matched to the
// catalogue, the draft the sheet shows, and what saving it does to the plan.
import { describe, it, expect } from 'vitest'
import { matchExercise, configOf, draftOf, pickFor, draftIssues, routineOf, savePlan, takenDays, draftUsable, sameNamed, scheduleKind, replacedWeek, planSnapshot } from './plan-text.js'
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
    const [bench, raise, push, odd] = d.sessions[0].items
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
    const odd = d.sessions[0].items[3]
    const picked = pickFor(odd, EXIDX['0025'])
    expect(picked.ex.id).toBe('0025')
    expect(picked.sure).toBe(true)
    expect(picked.cfg).toMatchObject({ sets: 3, reps: 10 })
  })
  it('a routine leaves out what has no exercise, and a superset left alone', () => {
    const d = draftOf(PLAN)
    d.sessions[0].items[2] = { ...d.sessions[0].items[2], ex: null }   // the pushdown, gone
    const r = routineOf(d.sessions[0])
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
    const { ids } = savePlan(s, d)
    expect(ids).toHaveLength(2)
    expect(s.routines.map(r => r.name)).toEqual(['Legs', 'Push', 'Pull'])
    expect(s.week[1]).toEqual([ids[0]])
    expect(s.week[4]).toEqual([ids[0]])
    expect(s.week[2]).toEqual([ids[1]])
    expect(s.week[3]).toEqual(['mine'])
  })
  it('without the schedule, only the routines', () => {
    const s = { routines: [], week: { 1: ['x'] } }
    savePlan(s, draftOf(PLAN), { schedule: false })
    expect(s.routines).toHaveLength(2)
    expect(s.week).toEqual({ 1: ['x'] })
  })
  it('two routines of the draft on one day share it, and an empty routine is not saved', () => {
    const s = { routines: [], week: {} }
    const d = draftOf({ routines: [{ name: 'A', days: [5], exercises: [ex('pull-up')] }, { name: 'B', days: [5], exercises: [ex('plank', { reps: 0, seconds: 30 })] }, { name: 'C', days: [6], exercises: [ex('qqqqzzzz xxyyww')] }] })
    const { ids } = savePlan(s, d)
    expect(ids).toHaveLength(2)
    expect(s.week[5]).toEqual(ids)
    expect(s.week[6]).toBeUndefined()
  })
})

// The week the person pasted (abridged): dated sessions, supersets by letter, rest and ramp sets,
// a football day, a class after the lifting, a rest day, and a line the coach left out.
const it2 = (line, name, more = {}) => ({ line, name, sets: 3, reps: 10, repsMin: 8, weight: 0, seconds: 0, minutes: 0, restSec: 0, warmupSets: 0, group: '', note: '', activity: false, ...more })
const WEEK = {
  kind: 'plan', name: 'Nov 10 to 15', comment: '',
  sessions: [
    { name: 'A Push + lats', date: '2026-11-10', days: [2], rest: false, note: '', items: [
      it2(2, 'lever incline chest press', { reps: 10, repsMin: 6, weight: 100, restSec: 90, warmupSets: 2, group: 'A', note: '1 to 2 RIR' }),
      it2(3, 'lever front pulldown', { weight: 79, restSec: 90, group: 'A' }),
      it2(4, 'lever shoulder press', { sets: 2, weight: 84, restSec: 120 }),
    ] },
    { name: 'B Pull + chest', date: '2026-11-11', days: [3], rest: false, note: 'Body scan this morning if not done Monday.', items: [
      it2(7, 'pull-up', { sets: 4, restSec: 90, group: 'A' }),
      it2(8, 'lever chest press', { weight: 110, restSec: 90, group: 'A' }),
      it2(11, 'boxing class', { activity: true, sets: 1, reps: 0, minutes: 30 }),
    ] },
    { name: 'Football', date: '2026-11-12', days: [4], rest: false, note: '', items: [it2(12, 'football', { activity: true, sets: 1, reps: 0, minutes: 60 })] },
    { name: 'Rest', date: '2026-11-14', days: [6], rest: true, note: '', items: [] },
  ],
}
const MISSED = [{ line: 9, text: '* B1 Seated cable row, V grip: 3 × 8 to 12 at 1 RIR, rest 65 s, 86 kg.' }]

describe('a dated plan', () => {
  it('reads its dates, rest days, groups, rest, ramp sets, activities and the lines left out', () => {
    const d = draftOf(WEEK, [], MISSED)
    expect(d.dated).toBe(true)
    expect(scheduleKind(d)).toBe('dates')
    const [a, b, foot, rest] = d.sessions
    expect(a.items[0].cfg).toMatchObject({ sets: 3, reps: 10, repsMin: 6, weight: 100, restSec: 90, warmupSets: 2 })
    expect(a.items[0].sg).toBeTruthy()
    expect(a.items[1].sg).toBe(a.items[0].sg)
    expect(a.items[2].sg).toBe('')
    expect(foot.items[0].ex.id).toBe('sport-football')
    expect(foot.items[0].cfg).toMatchObject({ sets: 1, min: 60 })
    // the class is no catalogue exercise: one of the person's own, made on save
    const box = b.items.find(it => it.said === 'boxing class')
    expect(box.make).toBe(true)
    expect(box.cfg).toMatchObject({ sets: 1, min: 30 })
    // the line left out sits in B, after the chest press and before the class
    expect(b.items.map(it => it.line)).toEqual([7, 8, 9, 11])
    expect(b.items[2]).toMatchObject({ ex: null, left: true, said: 'B1 Seated cable row, V grip: 3 × 8 to 12 at 1 RIR, rest 65 s, 86 kg.' })
    expect(draftIssues(d)).toEqual({ missing: 0, guesses: 0, left: 1 })
    expect(rest.rest).toBe(true)
    // a left-out line picked by hand becomes an item like any other
    expect(pickFor(b.items[2], EXIDX['0861'])).toMatchObject({ left: false, sure: true })
  })

  it('is saved as one coach week on its dates, its rest day marked, and Undo has all it needs', () => {
    const s = { routines: [{ id: 'mine', name: 'Legs', ex: [] }], customEx: [], week: { 2: ['mine'] }, dayPlan: { '2026-11-01': 'mine' }, queue: null }
    const before = planSnapshot(s)
    const d = draftOf(WEEK, [], MISSED)
    const { ids, made } = savePlan(s, d, { today: '2026-11-10', now: 1000 })
    expect(ids).toHaveLength(3)
    expect(made).toBe(1)
    expect(s.routines.map(r => r.name)).toEqual(['Legs', 'A Push + lats', 'B Pull + chest', 'Football'])
    const [, a, b] = s.routines
    expect(a.ex[0]).toMatchObject({ id: '1299', restSec: 90, warmupSets: 2, note: '1 to 2 RIR' })
    expect(a.ex[0].sg).toBe(a.ex[1].sg)
    expect(b.ex.map(e => e.id)).toEqual(['0652', '0576', s.customEx[0].id])   // the line left out is not saved
    expect(s.customEx[0]).toMatchObject({ n: 'boxing class', bp: 'cardio', custom: true })
    expect(s.queue).toEqual({ ids, since: 1000, startsOn: '2026-11-10', label: 'Nov 10 to 15' })
    expect(s.dayPlan).toEqual({ '2026-11-01': 'mine', '2026-11-10': ids[0], '2026-11-11': ids[1], '2026-11-12': ids[2], '2026-11-14': 'rest' })
    expect(s.week).toEqual({ 2: ['mine'] })   // the weekly template is left alone
    expect(before.routines).toHaveLength(1)
  })

  it('dates already past are not pinned, and a running week is the one it replaces', () => {
    const s = { routines: [], customEx: [], queue: { ids: ['x'], since: 1, startsOn: '2026-11-01', label: 'Old week' } }
    s.routines.push({ id: 'x', name: 'Old', ex: [{ id: '0025' }] })
    const d = draftOf(WEEK)
    expect(replacedWeek(s, d).label).toBe('Old week')
    savePlan(s, d, { today: '2026-11-12' })
    expect(Object.keys(s.dayPlan)).toEqual(['2026-11-12', '2026-11-14'])
    expect(s.queue.label).toBe('Nov 10 to 15')
  })

  it('read again, it updates the routines of the same name instead of adding them twice', () => {
    const s = { routines: [{ id: 'b1', name: 'b pull + CHEST', emoji: 'x', ex: [{ id: '0652' }] }], customEx: [{ id: 'cbox', n: 'Boxing class', bp: 'cardio', custom: true }], week: { 3: ['b1'] } }
    const d = draftOf(WEEK)
    expect(sameNamed(s, d)).toEqual([{ id: 'b1', name: 'b pull + CHEST' }])
    const { ids, updated, made } = savePlan(s, d, { today: '2026-11-10' })
    expect(updated).toBe(1)
    expect(made).toBe(0)                       // the class made before is used again
    expect(ids[1]).toBe('b1')
    expect(s.routines).toHaveLength(3)
    expect(s.routines[0]).toMatchObject({ id: 'b1', name: 'B Pull + chest', emoji: 'x' })
    expect(s.routines[0].ex.map(e => e.id)).toEqual(['0652', '0576', 'cbox'])
    expect(s.week).toEqual({ 3: ['b1'] })
    // without it, a new routine
    const s2 = { routines: [{ id: 'b1', name: 'B Pull + chest', ex: [] }], customEx: [] }
    savePlan(s2, draftOf(WEEK), { replace: false, today: '2026-11-10' })
    expect(s2.routines).toHaveLength(4)
  })

  it('a weekday plan replaces only its weekdays, and takenDays says which', () => {
    const d = draftOf({ kind: 'plan', sessions: [{ name: 'Up', days: [1], items: [it2(1, 'pull-up')] }, { name: 'Down', days: [4], items: [it2(2, 'barbell full squat')] }] })
    expect(scheduleKind(d)).toBe('weekdays')
    const s = { routines: [{ id: 'm', name: 'M', ex: [] }], week: { 1: ['m'] } }
    expect(takenDays(s, d)).toEqual([1])
    expect(replacedWeek(s, d)).toBeNull()
    savePlan(s, d)
    expect(s.week[1]).toEqual([s.routines[1].id])
    expect(s.queue).toBeUndefined()
  })
})
