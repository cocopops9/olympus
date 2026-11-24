import { describe, it, expect } from 'vitest'
import { MUSCLES, SECONDARY } from './muscles.js'
import { REGIONS, regionsOf, workoutsBetween, totalsOf, muscleDistribution } from './muscle-distribution.js'

const DAY = 86400000
const NOW = new Date('2026-11-24T18:00:00').getTime()

// A custom exercise carries its own muscles, so the test does not depend on the catalogue.
const press = { tg: 'chest', sm: ['triceps'] }
const squat = { tg: 'quadriceps' }
const entry = (id, exercise, sets) => ({ id, exercise, sets })
const set = (w, r, extra = {}) => ({ w, r, done: true, ...extra })
const workout = (daysAgo, entries, extra = {}) => ({
  id: 'w' + daysAgo, d: '2026-01-01', start: NOW - daysAgo * DAY, end: NOW - daysAgo * DAY + 3600000, entries, ...extra,
})

describe('regions of the muscle distribution radar', () => {
  it('puts every muscle of the map in exactly one region', () => {
    const all = REGIONS.flatMap(r => r.muscles)
    expect(new Set(all).size).toBe(all.length)
    expect([...all].sort()).toEqual([...MUSCLES].sort())
  })

  it('adds a region up from its muscles and rounds to a tenth', () => {
    expect(regionsOf({ biceps: 2, triceps: 1.4, forearm: 0.43, chest: 3 })).toMatchObject({ arms: 3.8, chest: 3, legs: 0 })
  })
})

describe('muscle distribution over a period', () => {
  const workouts = [
    workout(2, [entry('custom-press', press, [set(60, 10), set(60, 8), set(20, 10, { warmup: true }), { w: 60, r: 8, done: false }])], { vol: 1080 }),
    workout(10, [entry('custom-squat', squat, [set(100, 5), set(100, 5), set(100, 5)])]),
    workout(40, [entry('custom-squat', squat, [set(90, 5)])]),
  ]

  it('takes the workouts of (from, to] by when they happened', () => {
    expect(workoutsBetween(workouts, NOW - 7 * DAY, NOW).map(w => w.id)).toEqual(['w2'])
    expect(workoutsBetween(workouts, NOW - 10 * DAY, NOW).map(w => w.id)).toEqual(['w2'])
    expect(workoutsBetween(workouts, NOW - 11 * DAY, NOW).map(w => w.id)).toEqual(['w2', 'w10'])
  })

  it('counts work sets only: warm-ups and unticked sets stay out', () => {
    const t = totalsOf([workouts[0]])
    expect(t).toEqual({ workouts: 1, duration: 3600000, volume: 1080, sets: 2 })
  })

  it('compares the last 7 days with the 7 before them', () => {
    const d = muscleDistribution(workouts, 7, NOW)
    expect(d.current.regions.chest).toBe(2)
    expect(d.current.regions.arms).toBe(Math.round(2 * SECONDARY * 10) / 10)
    expect(d.current.regions.legs).toBe(0)
    expect(d.previous.regions.legs).toBe(3)
    expect(d.previous.totals).toMatchObject({ workouts: 1, sets: 3, volume: 1500 })
    // One rim for both polygons: the largest region of either period.
    expect(d.scale).toBe(3)
  })

  it('scales to zero when nothing was trained', () => {
    const d = muscleDistribution([], 30, NOW)
    expect(d.scale).toBe(0)
    expect(d.current.totals).toEqual({ workouts: 0, duration: 0, volume: 0, sets: 0 })
  })
})
