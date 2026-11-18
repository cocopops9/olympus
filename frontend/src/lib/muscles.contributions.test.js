import { describe, it, expect } from 'vitest'
import { loadOfWorkouts, muscleContributions, SECONDARY } from './muscles.js'

// Synthetic exercises carrying their own muscle snapshot, so the expectations do not depend on
// how the catalogue happens to tag a real movement.
const BENCH = { muscleWeights: { chest: 1, triceps: SECONDARY, deltoids: SECONDARY } }
const FLY = { muscleWeights: { chest: 1 } }
const PUSHDOWN = { muscleWeights: { triceps: 1 } }

const sets = (n, extra = {}) => Array.from({ length: n }, () => ({ w: 50, r: 8, done: true, ...extra }))
const entry = (id, exercise, list) => ({ id, exercise, sets: list })

describe('muscleContributions', () => {
  const week = [
    { id: 'w1', entries: [entry('x-bench', BENCH, sets(4)), entry('x-pushdown', PUSHDOWN, sets(2))] },
    { id: 'w2', entries: [entry('x-bench', BENCH, sets(3)), entry('x-fly', FLY, sets(3))] },
  ]

  it('orders the exercises by effective sets for the muscle: secondary sets count SECONDARY each', () => {
    const rows = muscleContributions(week, 'triceps')
    // bench: 7 sets x 0.4 = 2.8; pushdown: 2 sets x 1 = 2. More sets, but less work per set.
    expect(rows.map(r => r.id)).toEqual(['x-bench', 'x-pushdown'])
    expect(rows[0]).toMatchObject({ sets: 7, weight: SECONDARY })
    expect(rows[0].load).toBeCloseTo(7 * SECONDARY)
    expect(rows[1]).toMatchObject({ sets: 2, weight: 1, load: 2 })
  })

  it('adds the same exercise across workouts into one row', () => {
    const rows = muscleContributions(week, 'chest')
    expect(rows.map(r => [r.id, r.sets, r.load])).toEqual([['x-bench', 7, 7], ['x-fly', 3, 3]])
  })

  it('adds up to the load that shades the muscle on the map, and the shares to one', () => {
    const load = loadOfWorkouts(week)
    for (const slug of ['chest', 'triceps', 'deltoids']) {
      const rows = muscleContributions(week, slug)
      expect(rows.reduce((s, r) => s + r.load, 0)).toBeCloseTo(load[slug])
      expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1)
    }
  })

  it('counts only work sets ticked off, as the map does', () => {
    const ws = [{ id: 'w', entries: [entry('x-fly', FLY, [
      { w: 20, r: 10, done: true, warmup: true, type: 'warmup' },
      { w: 30, r: 10, done: true },
      { w: 30, r: 10, done: false },
    ])] }]
    const rows = muscleContributions(ws, 'chest')
    expect(rows.map(r => [r.id, r.sets])).toEqual([['x-fly', 1]])
    expect(loadOfWorkouts(ws).chest).toBe(1)
  })

  it('leaves out exercises that do not train the muscle, and is empty for an untrained one', () => {
    expect(muscleContributions(week, 'chest').some(r => r.id === 'x-pushdown')).toBe(false)
    expect(muscleContributions(week, 'calves')).toEqual([])
    expect(muscleContributions([], 'chest')).toEqual([])
  })

  it('breaks a tie in effective sets by the number of sets, then by id', () => {
    const SUPPORT = { muscleWeights: { chest: SECONDARY, triceps: 1 } }
    const ws = [{ id: 'w', entries: [
      entry('x-b', FLY, sets(2)),
      entry('x-a', FLY, sets(2)),
      entry('x-c', SUPPORT, sets(5)),   // 5 x 0.4 = 2 effective sets, the same as each fly
    ] }]
    expect(muscleContributions(ws, 'chest').map(r => r.id)).toEqual(['x-c', 'x-a', 'x-b'])
  })
})
