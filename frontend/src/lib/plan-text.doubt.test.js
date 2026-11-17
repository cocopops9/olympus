// A written workout: a weight the person wrote opens the next session as written, and the
// coach's doubts are questions the person answers before anything is saved.
import { describe, it, expect } from 'vitest'
import { configOf, draftOf, draftIssues, answerDoubt, matchExercise } from './plan-text.js'
import { buildSessionEntries, weightPinned } from './session-start.js'
import { isWarmupRow } from './workout-model.js'

const ex = (name, more = {}) => ({ name, sets: 3, reps: 10, repsMin: 0, weight: 0, seconds: 0, minutes: 0, superset: '', note: '', ...more })
const bench = matchExercise('barbell bench press').ex

describe('a weight written in the text', () => {
  it('is pinned with the time it was written; none written, nothing pinned', () => {
    expect(configOf(ex('bench', { weight: 86 }), bench, 1000).weightPin).toBe(1000)
    expect(configOf(ex('bench'), bench, 1000).weightPin).toBeUndefined()
  })

  it('opens the next session at 86 kg even though the last one lifted 80, then history takes over again', () => {
    const at = Date.parse('2026-11-17T20:00:00')
    const cfg = { id: bench.id, ...configOf(ex('bench', { sets: 3, reps: 3, weight: 86 }), bench, at), prog: 'linear' }
    const before = { d: '2026-11-15', start: at - 2 * 86400000, end: at - 2 * 86400000 + 3600000, routineIds: ['r'],
      entries: [{ id: bench.id, target: { sets: 3, reps: 3, weight: 80 }, sets: [80, 80, 80].map(w => ({ w, r: 3, done: true })) }] }
    const st = { unit: 'kg', exWeights: { [bench.id]: { w: 80, d: '2026-11-15' } }, routines: [], workouts: [before] }
    const r = { id: 'r', prog: 'linear', ex: [cfg] }
    expect(weightPinned(st, cfg)).toBe(true)
    const work = buildSessionEntries(st, r)[0].sets.filter(s => !isWarmupRow(s))
    expect(work.map(s => s.w)).toEqual([86, 86, 86])
    expect(work.map(s => s.r)).toEqual([3, 3, 3])

    // trained once after it was written: the pin has done its job
    const after = { ...before, d: '2026-11-18', start: at + 86400000, end: at + 86400000 + 3600000,
      entries: [{ id: bench.id, target: { sets: 3, reps: 3, weight: 86 }, sets: [86, 86, 86].map(w => ({ w, r: 3, done: true })) }] }
    expect(weightPinned({ ...st, workouts: [before, after] }, cfg)).toBe(false)
  })
})

describe('the coach\'s doubts', () => {
  const plan = doubt => ({ kind: 'workout', name: 'Push', sessions: [{ name: 'Push', days: [], items: [
    ex('lever chest press', { line: 1, weight: 50, doubt, options: doubt ? ['lever chest press', 'dumbbell bench press'] : [] }),
    ex('barbell curl', { line: 2 }),
  ] }] })

  it('an item with a doubt is a question with its options, and holds the draft until answered', () => {
    const d = draftOf(plan('The machine or with dumbbells?'), [])
    const it = d.sessions[0].items[0]
    expect(it.doubt).toBe('The machine or with dumbbells?')
    expect(it.sure).toBe(false)
    expect(it.options.map(o => o.n)).toEqual(['lever chest press', 'dumbbell bench press'])
    expect(draftIssues(d).doubts).toBe(1)

    const db = it.options[1]
    const answered = answerDoubt(it, db)
    expect(answered.doubt).toBeUndefined()
    expect(answered.ex).toBe(db)
    expect(answered.sure).toBe(true)
    expect(answered.cfg.weight).toBe(50)            // the numbers stay the ones written
    expect(draftIssues({ sessions: [{ items: [answered, d.sessions[0].items[1]] }] }).doubts).toBe(0)
  })

  it('no doubt, no question', () => {
    const d = draftOf(plan(''), [])
    expect(d.sessions[0].items[0].doubt).toBeUndefined()
    expect(draftIssues(d).doubts).toBe(0)
  })
})
