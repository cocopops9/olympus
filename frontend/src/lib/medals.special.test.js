// The special medals: days to remember and one-off feats, worked out from the workouts.
import { describe, it, expect } from 'vitest'
import { medalsOf } from './medals.js'

const at = (d, h = 18) => Date.parse(`${d}T${String(h).padStart(2, '0')}:00:00`)
const wk = (id, d, { h = 18, mins = 60, ex = ['a'], sets = 3, w = 50, prs = [], gym } = {}) => ({
  id, d, start: at(d, h), end: at(d, h) + mins * 60000, prs, gym,
  entries: ex.map(e => ({ id: e, sets: Array.from({ length: sets }, () => ({ w, r: 5, done: true })) })),
})
const special = S => Object.fromEntries(medalsOf({ unit: 'kg', bodyweight: [], ...S }).find(g => g.key === 'special').medals.map(m => [m.id.slice(8), m]))

describe('special medals', () => {
  it('days of the calendar: New Year, Christmas, Friday the 13th, a leap day', () => {
    const m = special({ workouts: [wk('1', '2026-01-01'), wk('2', '2026-02-13'), wk('3', '2026-12-25'), wk('4', '2028-02-29')] })
    expect(m.newyear.earned).toBe(true)
    expect(m.friday13.earned).toBe(true)          // 13 February 2026 is a Friday
    expect(m.christmas.earned).toBe(true)
    expect(m.leap.earned).toBe(true)
    expect(m.leap.at).toBe('2028-02-29')
    expect(m.halloween.earned).toBe(false)
  })

  it('seven days in a row, with how far along it is before', () => {
    const six = Array.from({ length: 6 }, (_, i) => wk('s' + i, `2026-03-0${i + 1}`))
    expect(special({ workouts: six }).seven.earned).toBe(false)
    expect(special({ workouts: six }).seven.progress).toBeCloseTo(6 / 7)
    const m = special({ workouts: [...six, wk('s6', '2026-03-07')] })
    expect(m.seven.earned).toBe(true)
    expect(m.seven.at).toBe('2026-03-07')
  })

  it('twice in a day, a comeback, a record day and the twelve labours', () => {
    const labours = Array.from({ length: 12 }, (_, i) => 'e' + i)
    const m = special({ workouts: [wk('a', '2026-04-01', { h: 8 }), wk('b', '2026-04-01', { h: 19 }), wk('c', '2026-05-10', { prs: [1, 2, 3, 4, 5], ex: labours })] })
    expect(m.twice.earned).toBe(true)
    expect(m.comeback.earned).toBe(true)
    expect(m.records.earned).toBe(true)
    expect(m.labours.earned).toBe(true)
  })

  it('a birthday and Atlas are offered only to someone with a birth date and a body weight', () => {
    expect(special({ workouts: [] }).birthday).toBeUndefined()
    expect(special({ workouts: [] }).atlas).toBeUndefined()
    const m = special({ birth: '1999-07-14', bodyweight: [{ d: '2026-07-01', w: 70 }], workouts: [wk('b', '2026-07-14', { w: 140 })] })
    expect(m.birthday.earned).toBe(true)
    expect(m.atlas.earned).toBe(true)
  })

  it('three gyms make a traveller', () => {
    const m = special({ workouts: [wk('1', '2026-01-05', { gym: 'A' }), wk('2', '2026-01-06', { gym: 'B' })] })
    expect(m.traveller.earned).toBe(false)
    expect(m.traveller.progress).toBeCloseTo(2 / 3)
    expect(special({ workouts: [wk('1', '2026-01-05', { gym: 'A' }), wk('2', '2026-01-06', { gym: 'B' }), wk('3', '2026-01-07', { gym: 'C' })] }).traveller.at).toBe('2026-01-07')
  })
})
