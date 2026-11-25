// The calendar's rest days: a day that ended with no workout, from the first workout on.
import { describe, expect, it } from 'vitest'
import { isRestDay, restDaysInMonth, trainingDays } from './rest-days.js'

const S = (...days) => ({ workouts: days.map((d, i) => ({ id: 'w' + i, d, start: Date.parse(d + 'T18:00:00') })) })

describe('rest days', () => {
  it('collects the trained days and the first of them, ignoring a workout with no date', () => {
    const td = trainingDays({ workouts: [{ d: '2026-11-10' }, { d: '2026-11-03' }, { d: '2026-11-10' }, { d: 'junk' }] })
    expect([...td.days].sort()).toEqual(['2026-11-03', '2026-11-10'])
    expect(td.first).toBe('2026-11-03')
    expect(trainingDays({ workouts: [] })).toEqual({ days: new Set(), first: null })
  })

  it('is a past day without a workout, on or after the first workout', () => {
    const td = trainingDays(S('2026-11-03', '2026-11-05'))
    const today = '2026-11-07'
    expect(isRestDay('2026-11-02', td, today)).toBe(false) // before the first workout
    expect(isRestDay('2026-11-03', td, today)).toBe(false) // trained
    expect(isRestDay('2026-11-04', td, today)).toBe(true)
    expect(isRestDay('2026-11-06', td, today)).toBe(true)
    expect(isRestDay('2026-11-07', td, today)).toBe(false) // today is not over yet
    expect(isRestDay('2026-11-08', td, today)).toBe(false) // the future
  })

  it('has none before any workout is logged', () => {
    expect(isRestDay('2026-11-04', trainingDays(S()), '2026-11-07')).toBe(false)
    expect(restDaysInMonth(S(), 2026, 10, '2026-11-07')).toBe(0)
  })

  it('counts a month up to yesterday, and whole past months after the first workout', () => {
    const st = S('2026-10-30', '2026-11-03', '2026-11-05')
    // November up to the 7th: 1, 2, 4, 6 are rest (3 and 5 trained, 7 is today).
    expect(restDaysInMonth(st, 2026, 10, '2026-11-07')).toBe(4)
    // October: only the 31st, since the first workout was on the 30th.
    expect(restDaysInMonth(st, 2026, 9, '2026-11-07')).toBe(1)
    // A month still ahead has none.
    expect(restDaysInMonth(st, 2026, 11, '2026-11-07')).toBe(0)
  })
})
