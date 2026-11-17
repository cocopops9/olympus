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

import { activeGym, recordHistory, gymMeta, saveGym, GYM_ICONS } from './gyms.js'

describe('gyms with a picture, the session\'s gym, and records per gym', () => {
  test('a gym added before any workout is offered, after the ones used', () => {
    const s = { workouts: [w('a', 'Home', 1e12)] }
    saveGym(s, '  New  place ', { icon: 'forge' }, 9)
    expect(gymsOf(s)).toEqual(['Home', 'New place'])
    expect(gymMeta(s, 'New place')).toEqual({ icon: 'forge', photo: null })
    // no picture chosen: a drawing picked by the name, the same one every time
    expect(GYM_ICONS).toContain(gymMeta(s, 'Home').icon)
    expect(gymMeta(s, 'Home').icon).toBe(gymMeta(s, 'Home').icon)
  })

  test('a photo is kept only when it is a small image data URL', () => {
    const s = {}
    saveGym(s, 'A', { photo: 'data:image/jpeg;base64,AAAA' })
    expect(gymMeta(s, 'A').photo).toBe('data:image/jpeg;base64,AAAA')
    saveGym(s, 'B', { photo: 'javascript:alert(1)' })
    expect(gymMeta(s, 'B').photo).toBe(null)
    saveGym(s, 'A', { photo: null })
    expect(gymMeta(s, 'A').photo).toBe(null)
  })

  test('renaming carries the picture; deleting drops it and the session\'s pick', () => {
    const s = { workouts: [w('a', 'Home', 1e12)], active: { gym: 'Home' } }
    saveGym(s, 'Home', { icon: 'stadium' })
    renameGym(s, 'Home', 'Casa', 3)
    expect(gymMeta(s, 'Casa').icon).toBe('stadium')
    expect(s.gyms.Home).toBeUndefined()
    expect(s.active.gym).toBe('Casa')
    deleteGym(s, 'Casa', 4)
    expect(s.gyms.Casa).toBeUndefined()
    expect(s.active.gym).toBe('')
  })

  test('the session\'s gym: picked, "no gym" picked, or the latest by default', () => {
    const base = { workouts: [w('a', 'Home', 1e12)] }
    expect(activeGym({ ...base, active: {} })).toBe('Home')
    expect(activeGym({ ...base, active: { gym: 'McFit' } })).toBe('McFit')
    expect(activeGym({ ...base, active: { gym: '' } })).toBe('')
    expect(activeGym({ ...base, active: null })).toBe('')
  })

  test('records per gym: the same gym and the workouts with no gym count; off, everything counts', () => {
    const S = { workouts: [w('a', 'Home', 1e12), w('b', 'McFit', 2e12), w('c', null, 3e12)] }
    expect(recordHistory(S, 'Home')).toBe(S)
    const on = { ...S, recordsByGym: true }
    expect(recordHistory(on, 'Home').workouts.map(x => x.id)).toEqual(['a', 'c'])
    expect(recordHistory(on, 'McFit').workouts.map(x => x.id)).toEqual(['b', 'c'])
    expect(recordHistory(on, '')).toBe(on)
  })
})
