// @vitest-environment happy-dom
// What Hercules is told about the person (lib/hercules-context.js).
import { describe, expect, it } from 'vitest'
import { herculesContext, MAX_CONTEXT } from './hercules-context.js'
import { freshState } from '../store/useStore.js'

const set = (w, r) => ({ w, r, done: true })
const S = {
  ...freshState(),
  unit: 'kg', body: 'female', weekStart: 1, routines: [{ id: 'r1', name: 'Push day', ex: [{ id: '0025', sets: 4, reps: 8, weight: 60 }] }],
  workouts: [
    { id: 'a', name: 'Push day', d: '2026-10-23', start: Date.parse('2026-10-23T10:00:00'), end: Date.parse('2026-10-23T11:00:00'), entries: [{ id: '0025', sets: [set(60, 8), set(62.5, 6)] }] },
    { id: 'old', name: 'Old', d: '2026-06-01', start: 1, end: 2, entries: [{ id: '0025', sets: [set(40, 10)] }] },
  ],
  exWeights: { '0025': { w: 62.5, d: '2026-10-23' } },
  bodyweight: [{ d: '2026-10-20', w: 61.2 }],
}

describe('Hercules context', () => {
  const text = herculesContext(S, '2026-10-25')
  it('carries the recent workouts with their best sets, not the old ones', () => {
    expect(text).toMatch(/2026-10-23 Push day/)
    expect(text).toMatch(/barbell bench press/i)
    expect(text).not.toMatch(/Old/)
  })
  it('carries the routines, the plan, the bests and the latest body weight', () => {
    expect(text).toMatch(/Push day: .*4x8 at 60 kg/i)
    expect(text).toMatch(/Weekly plan/)
    expect(text).toMatch(/Heaviest weights lifted: .*62.5 kg/)
    expect(text).toMatch(/Latest body weight: 61.2 kg/)
    expect(text).toMatch(/Sex: female/)
  })
  it('stays within the limit', () => {
    const many = { ...S, workouts: Array.from({ length: 400 }, (_, i) => ({ ...S.workouts[0], id: 'w' + i, note: 'x'.repeat(300) })) }
    expect(herculesContext(many, '2026-10-25').length).toBeLessThanOrEqual(MAX_CONTEXT)
  })
  it('says little for a new profile', () => {
    expect(herculesContext(freshState(), '2026-10-25')).toMatch(/Workouts logged: 0/)
  })
})
