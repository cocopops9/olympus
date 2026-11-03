// Medals that follow what the person told their coaches (lib/goal-medals.js, through medalsOf):
// targets in their goals and in the notes the coaches keep, how often they want to train, the way
// they train and their phase; and the administrator's catalogue of every medal.
import { describe, it, expect } from 'vitest'
import { medalsOf, allMedals } from './medals.js'
import { LIFTS, METRICS } from './strength-level.js'

const lift = k => LIFTS.find(l => l.key === k).id
const DAY = 86400000
const T0 = Date.UTC(2026, 0, 5, 18)   // a Monday
const iso = ms => new Date(ms).toISOString().slice(0, 10)
const NOW = T0 + 200 * DAY
let n = 0
// A workout `day` days after T0, with sets [[weight, reps], ...] of exercise `ex`.
const workout = (day, { ex = lift('squat'), sets = [[100, 5]], mins = 60, prs = [], vol = 3000 } = {}) => {
  const start = T0 + day * DAY
  return { id: 'w' + (n++), d: iso(start), start, end: start + mins * 60000, vol, prs, entries: [{ id: ex, sets: sets.map(([w, r]) => ({ w, r, done: true })) }] }
}
const person = (over = {}) => ({ unit: 'kg', body: 'male', birth: '1996-03-01', bodyweight: [{ d: '2026-01-01', w: 80 }], workouts: [], wposts: {}, medals: {}, ...over })
const profile = (goals, extra = {}) => ({ coachProfile: { styles: [], phase: null, goals, ...extra } })
const ofGoals = (S, opts = {}) => (medalsOf(S, {}, NOW, opts).find(g => g.key === 'goals')?.medals || [])
const byId = (list, id) => list.find(m => m.id === id)

describe('a target they named', () => {
  const S = person({ ...profile('I want to bench 100 kg by December'), workouts: [workout(0, { ex: lift('bench'), sets: [[60, 5]] })] })   // e1RM 70

  it('becomes a medal for the goal and for the steps on the way, the goal being the top one', () => {
    const g = ofGoals(S).filter(m => m.id.startsWith('goal:bench:'))
    expect(g.map(m => m.value)).toEqual([85, 92.5, 100])
    expect(g.every(m => !m.earned)).toBe(true)
    const final = byId(g, 'goal:bench:100')
    expect(final.tier).toBe('olympian')
    expect(final.desc).toMatch(/goal you gave/)
    expect(byId(g, 'goal:bench:85').desc).toMatch(/On the way/)
    expect(final.progress).toBeCloseTo(0.7, 1)
  })

  it('is read from the notes of the coaches too', () => {
    const T = person({ ...profile(''), workouts: S.workouts })
    expect(ofGoals(T)).toEqual([])
    const g = ofGoals(T, { notes: ['Wants a 100 kg bench press by December'] })
    expect(byId(g, 'goal:bench:100')).toBeTruthy()
  })

  it('is earned, with its date, when the numbers say so, and the plain round-weight medal is not shown twice', () => {
    const T = person({ ...profile('bench 100 kg'), workouts: [workout(0, { ex: lift('bench'), sets: [[60, 5]] }), workout(30, { ex: lift('bench'), sets: [[90, 5]] })] })   // 105
    const all = allMedals(medalsOf(T, {}, NOW))
    const goal = byId(all, 'goal:bench:100')
    expect(goal.earned).toBe(true)
    expect(goal.at).toBe(iso(T0 + 30 * DAY))
    expect(byId(all, 'lift:bench:100')).toBeUndefined()
  })

  it('reads reps for an exercise without weight, and counts a goal below what they can already do as done', () => {
    const T = person({ ...profile('20 pull-ups'), workouts: [workout(0, { ex: METRICS.find(m => m.key === 'pull-up').id, sets: [[0, 8]] })] })
    const g = ofGoals(T).filter(m => m.id.startsWith('goal:pull-up:'))
    expect(g.map(m => m.value)).toEqual([14, 17, 20])
    expect(g[2].title).toMatch(/20 reps/)
  })

  it('is left out when the goals say nothing it can read', () => {
    expect(ofGoals(person({ ...profile('I want to feel strong and play football'), workouts: S.workouts }))).toEqual([])
  })
})

describe('how often they want to train', () => {
  const days = [0, 2, 4, 7, 9, 11, 14, 16, 18, 21, 23, 25]   // three a week for four weeks
  const S = person({ ...profile('Train 3 times a week'), workouts: days.map(d => workout(d)) })
  it('counts weeks in a row at that many workouts', () => {
    const g = ofGoals(S).filter(m => m.id.startsWith('goal:week3:'))
    expect(byId(g, 'goal:week3:2').earned).toBe(true)
    expect(byId(g, 'goal:week3:4').earned).toBe(true)
    expect(byId(g, 'goal:week3:4').at).toBe(iso(T0 + 21 * DAY))
    expect(byId(g, 'goal:week3:8').earned).toBe(false)
  })
  it('does not count a week with fewer', () => {
    const T = person({ ...profile('Train 4 times a week'), workouts: days.map(d => workout(d)) })
    expect(ofGoals(T).find(m => m.id === 'goal:week4:2')).toMatchObject({ earned: false })
  })
})

describe('the way they train', () => {
  it('a powerlifter has a total with levels', () => {
    const S = person({ ...profile('', { styles: ['powerlifting'] }), workouts: [
      workout(0, { ex: lift('squat'), sets: [[150, 3]] }), workout(2, { ex: lift('bench'), sets: [[110, 3]] }), workout(4, { ex: lift('deadlift'), sets: [[180, 3]] })] })
    const g = ofGoals(S)
    expect(byId(g, 'goal:total:intermediate').earned).toBe(true)
    expect(byId(g, 'goal:total:elite').earned).toBe(false)
    expect(g.find(m => m.id.startsWith('goal:total:')).title).toMatch(/Powerlifting total/)
  })
  it('somebody who does not train for strength has no total', () => {
    expect(ofGoals(person({ ...profile('', { styles: ['health'] }), workouts: [workout(0)] })).some(m => m.id.startsWith('goal:total:'))).toBe(false)
  })
  it('weeks with a new record, for the styles that chase them', () => {
    const rec = [{ ex: 'x' }]
    const W = [workout(0, { prs: rec }), workout(3), workout(7, { prs: rec }), workout(10)]
    expect(byId(ofGoals(person({ ...profile('', { styles: ['bodybuilding'] }), workouts: W })), 'goal:record-weeks:1').earned).toBe(true)
    expect(ofGoals(person({ ...profile('', { styles: ['bodybuilding'] }), workouts: W })).find(m => m.id === 'goal:record-weeks:4').earned).toBe(false)
    expect(ofGoals(person({ ...profile('', { styles: ['endurance'] }), workouts: W })).some(m => m.id.startsWith('goal:record-weeks'))).toBe(false)
  })
  it('minutes of training in a week, measured against the 150 the WHO recommends', () => {
    const W = [0, 2, 4].map(d => workout(d, { mins: 60 }))   // 180 minutes in the week
    const g = ofGoals(person({ ...profile('', { styles: ['health'] }), workouts: W })).filter(m => m.id.startsWith('goal:minutes:'))
    expect(g.filter(m => m.earned).map(m => m.value)).toEqual([60, 120, 150])
    expect(g.find(m => m.value === 210).earned).toBe(false)
    expect(g[0].desc).toMatch(/World Health Organization/)
  })
  it('shows the exercises the style points at, before they are trained', () => {
    const none = allMedals(medalsOf(person({ ...profile('', { styles: [] }) }), {}, NOW)).filter(m => m.id.startsWith('level:'))
    expect(none).toEqual([])
    const pl = allMedals(medalsOf(person({ ...profile('', { styles: ['powerlifting'] }) }), {}, NOW)).filter(m => m.id.startsWith('level:'))
    expect(pl.some(m => m.id === 'level:squat:intermediate')).toBe(true)
    expect(pl.some(m => m.id === 'level:bench:intermediate')).toBe(true)
    expect(pl.some(m => m.id.startsWith('level:run:'))).toBe(false)
  })
})

describe('the phase', () => {
  const since = Date.UTC(2026, 0, 1)
  it('a cut counts the body weight lost since it began', () => {
    const S = person({ ...profile('', { phase: 'cut', since }), bodyweight: [{ d: '2026-01-02', w: 80 }, { d: '2026-02-01', w: 78 }, { d: '2026-03-01', w: 76 }], workouts: [workout(0)] })
    const g = ofGoals(S).filter(m => m.id.startsWith('goal:cut:'))
    expect(g.filter(m => m.earned).map(m => m.value)).toEqual([1, 2, 3, 5])
    expect(byId(g, 'goal:cut:5').at).toBe('2026-03-01')
    expect(g.find(m => m.value === 7.5).earned).toBe(false)
  })
  it('a cut that began on an unknown day, or has one weigh-in, has no medals', () => {
    expect(ofGoals(person({ ...profile('', { phase: 'cut' }), bodyweight: [{ d: '2026-01-02', w: 80 }, { d: '2026-03-01', w: 70 }] })).some(m => m.id.startsWith('goal:cut'))).toBe(false)
    expect(ofGoals(person({ ...profile('', { phase: 'cut', since }), bodyweight: [{ d: '2026-01-02', w: 80 }] })).some(m => m.id.startsWith('goal:cut'))).toBe(false)
  })
  it('a comeback counts weeks in a row with a workout since it began', () => {
    const S = person({ ...profile('', { phase: 'recover', since }), workouts: [workout(0), workout(7), workout(14)] })
    const g = ofGoals(S).filter(m => m.id.startsWith('goal:comeback:'))
    expect(g.filter(m => m.earned).map(m => m.value)).toEqual([1, 2])
  })
})

describe('the catalogue of all medals', () => {
  const S = person({ workouts: [workout(0)] })
  const mine = allMedals(medalsOf(S, {}, NOW))
  const everything = allMedals(medalsOf(S, {}, NOW, { all: true }))
  it('has every medal of the app, the person\'s own included', () => {
    expect(everything.length).toBeGreaterThan(mine.length * 2)
    const ids = new Set(everything.map(m => m.id))
    for (const m of mine) expect(ids.has(m.id), m.id).toBe(true)
  })
  it('has the whole ladders, the exercises never done and the families of goals', () => {
    const ids = everything.map(m => m.id)
    expect(ids).toContain('lift:squat:300')
    expect(ids).toContain('vol-total:10000000')
    expect(ids).toContain('level:burpee:elite')
    expect(ids).toContain('level:rowing:advanced')
    for (const f of ['goal:total:elite', 'goal:record-weeks:52', 'goal:minutes:420', 'goal:cut:10', 'goal:comeback:12', 'goal:week3:26']) expect(ids, f).toContain(f)
    expect(ids.some(i => i.startsWith('goal:squat:'))).toBe(true)
  })
  it('keeps every id once, and does not turn an unearned medal into an earned one', () => {
    const ids = everything.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    const earnedMine = new Set(mine.filter(m => m.earned).map(m => m.id))
    expect(everything.filter(m => m.earned).every(m => earnedMine.has(m.id) || m.progress === 1)).toBe(true)
  })
  it('works for somebody with no birth date or body weight yet', () => {
    const bare = person({ birth: '', bodyweight: [] })
    expect(allMedals(medalsOf(bare, {}, NOW, { all: true })).length).toBeGreaterThan(100)
  })
})
