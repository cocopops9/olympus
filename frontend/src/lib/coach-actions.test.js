// @vitest-environment happy-dom
// The coaches as agents (lib/coach-actions.js): actions read out of a reply, checked against the
// closed list, and applied to the training document only through applyAction. Plus the gym label
// on workouts (lib/gyms.js) that Stats filters progress by.
import { describe, expect, it } from 'vitest'
import { splitActions, checkAction, applyAction, findExercise, describeAction } from './coach-actions.js'
import { gymsOf, setWorkoutGym, gymsForExercise, cleanGym } from './gyms.js'

const block = o => '```olympus-action\n' + JSON.stringify(o) + '\n```'

describe('coach actions', () => {
  it('reads the blocks out of the reply and keeps only known, checked ones', () => {
    const reply = 'Here is your plan.\n\n' + block({ type: 'set_rest', seconds: 9999 }) + '\n' + block({ type: 'delete_everything' }) + '\n```olympus-action\nnot json\n```'
    const { text, actions } = splitActions(reply)
    expect(text).toBe('Here is your plan.')
    expect(actions).toEqual([{ type: 'set_rest', seconds: 600 }])
  })
  it('finds exercises by their English name, and drops a routine with none it knows', () => {
    expect(findExercise('barbell bench press')?.n).toBe('barbell bench press')
    expect(checkAction({ type: 'create_routine', name: 'X', exercises: [{ name: 'zzqqxx nothing' }] })).toBe(null)
    const r = checkAction({ type: 'create_routine', name: ' Push A ', exercises: [{ name: 'barbell bench press', sets: 40, reps: 6, weight: 80 }] })
    expect(r.name).toBe('Push A')
    expect(r.exercises[0]).toMatchObject({ sets: 10, reps: 6, weight: 80 })
    expect(describeAction(r, { unit: 'kg' }).lines[0]).toMatch(/10 × 6 · 80 kg/)
  })
  it('applies: a routine, the rest, the stats, the goals', () => {
    const s = { routines: [], restSec: 90, workouts: [] }
    const r = checkAction({ type: 'create_routine', name: 'Legs', exercises: [{ name: 'barbell full squat', sets: 5, reps: 5, weight: 100 }] })
    const res = applyAction(s, r)
    expect(s.routines[0]).toMatchObject({ id: res.routine, name: 'Legs' })
    expect(s.routines[0].ex[0]).toMatchObject({ sets: 5, reps: 5, weight: 100 })
    applyAction(s, checkAction({ type: 'set_rest', seconds: 150 }))
    expect(s.restSec).toBe(150)
    applyAction(s, checkAction({ type: 'set_stats_cards', cards: ['progress', 'nope', 'summary'] }))
    expect(s.statsCards).toEqual(['progress', 'summary'])
    applyAction(s, checkAction({ type: 'set_goals', styles: ['powerlifting'], goals: 'Meet in May' }))
    expect(s.coachProfile).toEqual({ styles: ['powerlifting'], phase: null, goals: 'Meet in May' })
  })
  it('during a workout: adds an exercise after the current one and sets the next sets', () => {
    const s = { active: { cur: 0, entries: [{ id: '0025', sets: [{ w: 60, r: 8, done: true }, { w: 60, r: 8, done: false, sug: ['w', 'r'] }] }] } }
    applyAction(s, checkAction({ type: 'set_next_sets', weight: 62.5, reps: 6 }))
    expect(s.active.entries[0].sets[1]).toEqual({ w: 62.5, r: 6, done: false })
    expect(s.active.entries[0].sets[0]).toMatchObject({ w: 60, r: 8 })
    applyAction(s, checkAction({ type: 'add_exercise', name: 'barbell full squat', sets: 2, reps: 5, weight: 100 }))
    expect(s.active.entries).toHaveLength(2)
    expect(s.active.cur).toBe(1)
    expect(s.active.entries[1].sets).toHaveLength(2)
    expect(() => applyAction({ active: null }, checkAction({ type: 'set_next_sets', weight: 50 }))).toThrow()
  })
})

describe('gyms', () => {
  it('lists the gyms used, sets and clears one on a workout, and per exercise', () => {
    const s = { workouts: [
      { id: 'a', d: '2026-10-01', start: 1, entries: [{ id: '0025', sets: [] }], gym: 'Home' },
      { id: 'b', d: '2026-10-02', start: 2, entries: [{ id: '0043', sets: [] }] },
    ] }
    setWorkoutGym(s, s.workouts[1], '  McFit   Centro ')
    expect(s.workouts[1].gym).toBe('McFit Centro')
    expect(s.workouts[1]._ts).toBeGreaterThan(0)
    expect(gymsOf(s)).toEqual(['Home', 'McFit Centro'])
    expect(gymsForExercise(s, '0025')).toEqual(['Home'])
    setWorkoutGym(s, s.workouts[0], '')
    expect(s.workouts[0].gym).toBeUndefined()
    expect(cleanGym('x'.repeat(80))).toHaveLength(40)
  })
})
