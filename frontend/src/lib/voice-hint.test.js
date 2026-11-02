// The words a person is likely to say, from their own data (lib/voice-hint.js).
import { describe, it, expect } from 'vitest'
import { voiceHint } from './voice-hint.js'
import { EXIDX } from './exercises.js'
import { exerciseNameFor } from './i18n-core.js'

const ids = Object.keys(EXIDX).slice(0, 4)
const nm = id => exerciseNameFor(EXIDX[id])

describe('voiceHint', () => {
  it('puts the exercise on now first, then the rest of the workout, routines and recent sessions, once each', () => {
    const S = {
      active: { cur: 1, entries: [{ id: ids[0] }, { id: ids[1] }] },
      routines: [{ ex: [{ id: ids[2] }, { id: ids[0] }] }],
      workouts: [{ entries: [{ id: ids[3] }] }],
    }
    expect(voiceHint(S).split(', ')).toEqual([nm(ids[1]), nm(ids[0]), nm(ids[2]), nm(ids[3])])
  })
  it('is empty with no data and never throws', () => {
    expect(voiceHint({})).toBe('')
    expect(voiceHint(null)).toBe('')
    expect(voiceHint({ active: { cur: 5 }, workouts: [null] })).toBe('')
  })
})
