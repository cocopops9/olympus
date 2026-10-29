import { describe, expect, test } from 'vitest'
import { gymsOf, lastGym, renameGym, deleteGym, gymUseCount, setWorkoutGym } from './gyms.js'

const w = (id, gym, end) => ({ id, d: new Date(end).toISOString().slice(0, 10), start: end - 3600000, end, entries: [], ...(gym ? { gym } : {}) })

describe('gyms', () => {
  test('the latest workout with a gym gives the default, whatever the order of the list', () => {
    const S = { workouts: [w('a', 'Home', 3e12), w('b', 'McFit Centro', 1e12), w('c', null, 4e12)] }
    expect(lastGym(S)).toBe('Home')
    expect(lastGym({ workouts: [] })).toBe('')
    // The workout just finished is not its own default.
    expect(lastGym(S, S.workouts[0])).toBe('McFit Centro')
  })

  test('renaming changes every workout with that gym and stamps each one', () => {
    const s = { workouts: [w('a', 'Home', 1e12), w('b', 'Home', 2e12), w('c', 'Gym B', 3e12)] }
    expect(renameGym(s, 'Home', '  Home  gym ', 5)).toBe(2)
    expect(s.workouts.map(x => x.gym)).toEqual(['Home gym', 'Home gym', 'Gym B'])
    expect(s.workouts.map(x => x._ts)).toEqual([5, 5, undefined])
    // Onto an existing name: the two merge.
    expect(renameGym(s, 'Gym B', 'Home gym', 6)).toBe(1)
    expect(gymsOf(s)).toEqual(['Home gym'])
    expect(renameGym(s, 'Home gym', '   ')).toBe(0)
  })

  test('deleting takes the label off, the workouts stay', () => {
    const s = { workouts: [w('a', 'Home', 1e12), w('b', 'Gym B', 2e12)] }
    expect(gymUseCount(s, 'Home')).toBe(1)
    expect(deleteGym(s, 'Home', 7)).toBe(1)
    expect(s.workouts).toHaveLength(2)
    expect('gym' in s.workouts[0]).toBe(false)
    expect(s.workouts[0]._ts).toBe(7)
    expect(gymsOf(s)).toEqual(['Gym B'])
  })

  test('setting the gym of one workout leaves the others alone', () => {
    const s = { workouts: [w('a', null, 1e12), w('b', 'Gym B', 2e12)] }
    setWorkoutGym(s, s.workouts[0], 'Home')
    expect(s.workouts.map(x => x.gym)).toEqual(['Home', 'Gym B'])
  })
})
