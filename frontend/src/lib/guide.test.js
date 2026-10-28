// The guide (lib/guide.js): who is welcomed, which tips each level of help shows, and the writers
// leaving the hints map they were given alone.
import { describe, expect, it } from 'vitest'
import { guideLevelOf, needsWelcome, tipVisible, withTipSeen, withGuideLevel, withWelcomed, withTipsReset, TIPS } from './guide.js'

const blank = (hints = {}) => ({ hints, workouts: [], routines: [] })
const trained = (hints = {}) => ({ hints, workouts: [{ id: 'w1' }], routines: [] })

describe('guide level', () => {
  it('follows the answer to the welcome', () => {
    for (const level of ['new', 'some', 'off']) expect(guideLevelOf(blank({ guide: level }))).toBe(level)
  })
  it('without an answer: the full guide on a blank profile, analysis tips only on one with training', () => {
    expect(guideLevelOf(blank())).toBe('new')
    expect(guideLevelOf(trained())).toBe('some')
    expect(guideLevelOf({ hints: {}, workouts: [], routines: [{ id: 'r' }] })).toBe('some')
    expect(guideLevelOf(blank({ guide: 'nonsense' }))).toBe('new')
    expect(guideLevelOf({})).toBe('new')
  })
})

describe('welcome', () => {
  it('opens once, on a profile with nothing in it', () => {
    expect(needsWelcome(blank())).toBe(true)
    expect(needsWelcome(blank({ welcomed: true }))).toBe(false)
    expect(needsWelcome(blank({ guide: 'some' }))).toBe(false)
  })
  it('never greets someone who already trains as a newcomer', () => {
    expect(needsWelcome(trained())).toBe(false)
  })
})

describe('tips', () => {
  it('a newcomer sees every tip until it is dismissed', () => {
    const S = blank({ guide: 'new' })
    for (const id of Object.keys(TIPS)) expect(tipVisible(S, id), id).toBe(true)
    expect(tipVisible({ ...S, hints: withTipSeen(S.hints, 'plan') }, 'plan')).toBe(false)
  })
  it('someone who knows apps like this only sees the analysis tips', () => {
    const S = blank({ guide: 'some' })
    expect(tipVisible(S, 'workoutStart')).toBe(false)
    expect(tipVisible(S, 'stats')).toBe(true)
    expect(tipVisible(S, 'structural')).toBe(true)
  })
  it('the basic tips wait for the welcome; the analysis ones do not', () => {
    expect(tipVisible(blank(), 'workoutStart')).toBe(false)
    expect(tipVisible(blank({ welcomed: true }), 'workoutStart')).toBe(true)
    expect(tipVisible(blank(), 'stats')).toBe(true)
  })
  it('off means off, and an unknown tip never shows', () => {
    expect(tipVisible(blank({ guide: 'off' }), 'stats')).toBe(false)
    expect(tipVisible(blank({ guide: 'new' }), 'nope')).toBe(false)
  })
})

describe('writers', () => {
  it('return a new map and leave the given one as it was', () => {
    const hints = Object.freeze({ swipeSets: true, tips: Object.freeze({ feed: true }) })
    expect(withTipSeen(hints, 'plan')).toEqual({ swipeSets: true, tips: { feed: true, plan: true } })
    expect(withGuideLevel(hints, 'off')).toEqual({ swipeSets: true, tips: { feed: true }, guide: 'off', welcomed: true })
    expect(withWelcomed(hints)).toEqual({ swipeSets: true, tips: { feed: true }, welcomed: true })
    expect(hints).toEqual({ swipeSets: true, tips: { feed: true } })
  })
  it('a level that is not one changes nothing', () => {
    expect(withGuideLevel({ guide: 'new' }, 'loud')).toEqual({ guide: 'new' })
  })
  it('showing the tips again brings every tip back, and turns tips back on', () => {
    expect(withTipsReset({ guide: 'off', welcomed: true, tips: { stats: true } })).toEqual({ guide: 'some', welcomed: true })
    expect(withTipsReset({ guide: 'new', tips: { stats: true } })).toEqual({ guide: 'new' })
    expect(withTipsReset(undefined)).toEqual({})
  })
  it('handle a profile with no hints map at all', () => {
    expect(withTipSeen(undefined, 'feed')).toEqual({ tips: { feed: true } })
    expect(tipVisible({ workouts: [], routines: [] }, 'stats')).toBe(true)
  })
})
