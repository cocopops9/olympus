import { describe, it, expect } from 'vitest'
import { sportTypeOf, distanceOf, localIso, activityFor, queueStrava, unqueueStrava, outcomeOf } from './strava.js'

const START = new Date(2026, 10, 25, 18, 5, 9).getTime()   // local time, as the phone has it
const set = (x = {}) => ({ done: true, ...x })
const lift = (id, sets) => ({ id, target: { mode: 'reps' }, sets })
const cardio = (id, sets) => ({ id, target: { mode: 'cardio' }, sets: sets.map(s => ({ mode: 'cardio', ...s })) })
const workout = (entries, x = {}) => ({ id: 'w1', name: 'Push day', d: '2026-11-25', start: START, end: START + 3600 * 1000, entries, ...x })
const opts = { unit: 'kg', nameOf: e => e.n || e.id, speedUnit: 'kmh' }

describe('sportTypeOf', () => {
  it('is weight training as soon as there is strength work', () => {
    expect(sportTypeOf(workout([cardio('0685', [set({ min: 10, speed: 10 })]), lift('0025', [set({ w: 80, r: 5 })])]))).toEqual({ sport_type: 'WeightTraining' })
  })
  it('is the machine’s activity, indoors, when one cardio machine is all there is', () => {
    expect(sportTypeOf(workout([cardio('0685', [set({ min: 30, speed: 10 })])]))).toEqual({ sport_type: 'Run', trainer: true })
    expect(sportTypeOf(workout([cardio('2138', [set({ min: 30, speed: 25 })])]))).toEqual({ sport_type: 'Ride', trainer: true })
  })
  it('is the sport when a sport is all there is, and Workout for mixes and unknowns', () => {
    expect(sportTypeOf(workout([cardio('sport-tennis', [set({ min: 60 })])]))).toEqual({ sport_type: 'Tennis' })
    expect(sportTypeOf(workout([cardio('sport-football', [set({ min: 90 })])]))).toEqual({ sport_type: 'Soccer' })
    expect(sportTypeOf(workout([cardio('sport-judo', [set({ min: 60 })])]))).toEqual({ sport_type: 'Workout' })
    expect(sportTypeOf(workout([cardio('sport-tennis', [set({ min: 60 })]), cardio('sport-padel', [set({ min: 30 })])]))).toEqual({ sport_type: 'Workout' })
    expect(sportTypeOf(workout([cardio('0685', [set({ min: 10, speed: 10 })]), cardio('2138', [set({ min: 10, speed: 20 })])]))).toEqual({ sport_type: 'Workout' })
  })
  it('ignores sets not done and warm-ups', () => {
    expect(sportTypeOf(workout([cardio('0685', [set({ min: 30, speed: 10 })]), lift('0025', [{ w: 80, r: 5, done: false }])]))).toEqual({ sport_type: 'Run', trainer: true })
  })
})

describe('distanceOf', () => {
  it('adds minutes × km/h over the done cardio sets, in metres', () => {
    expect(distanceOf(workout([cardio('0685', [set({ min: 30, speed: 10 }), set({ min: 6, speed: 12 }), { mode: 'cardio', min: 60, speed: 10, done: false }])]))).toBe(6200)
  })
})

describe('localIso', () => {
  it('is the wall-clock time with no zone', () => {
    expect(localIso(START)).toBe('2026-11-25T18:05:09')
  })
})

describe('activityFor', () => {
  it('names, times and describes a strength workout', () => {
    const a = activityFor(workout([lift('0025', [set({ w: 80, r: 5 }), set({ w: 80, r: 5 })])]), opts)
    expect(a).toMatchObject({ wid: 'w1', name: 'Push day', sport_type: 'WeightTraining', start_date_local: '2026-11-25T18:05:09', elapsed_time: 3600 })
    expect(a.description).toMatch(/80×5, 80×5/)
    expect(a.description).not.toMatch(/Push day/)      // the name is the title already
    expect(a).not.toHaveProperty('distance')
    expect(a).not.toHaveProperty('trainer')
  })
  it('carries the distance of a run', () => {
    const a = activityFor(workout([cardio('0685', [set({ min: 30, speed: 10 })])]), opts)
    expect(a).toMatchObject({ sport_type: 'Run', distance: 5000, trainer: true })
  })
  it('is null without an id, times or anything done', () => {
    expect(activityFor(workout([lift('0025', [set({ w: 80, r: 5 })])], { id: undefined }), opts)).toBeNull()
    expect(activityFor(workout([lift('0025', [set({ w: 80, r: 5 })])], { end: START }), opts)).toBeNull()
    expect(activityFor(workout([lift('0025', [{ w: 80, r: 5, done: false }])]), opts)).toBeNull()
  })
})

describe('the queue', () => {
  it('queues only for a connected account and a workout with work in it', () => {
    const w = workout([lift('0025', [set({ w: 80, r: 5 })])])
    const off = {}
    queueStrava(off, w)
    expect(off.stravaQ).toBeUndefined()
    const s = { stravaOn: true }
    queueStrava(s, workout([lift('0025', [{ w: 80, r: 5, done: false }])], { id: 'w0' }))
    queueStrava(s, w)
    expect(s.stravaQ).toEqual({ w1: '' })
    unqueueStrava(s, 'w1')
    expect(s.stravaQ).toEqual({})
  })
  it('keeps a workout for later only when the failure may pass', () => {
    const err = (status, code) => Object.assign(new Error('x'), { status, data: code ? { code } : {} })
    expect(outcomeOf(null)).toBe('done')
    expect(outcomeOf(err(422, 'strava-refused'))).toBe('done')
    expect(outcomeOf(err(409, 'strava-off'))).toBe('off')
    expect(outcomeOf(err(404))).toBe('off')
    expect(outcomeOf(err(409, 'strava-busy'))).toBe('retry')
    expect(outcomeOf(err(503, 'strava-busy'))).toBe('retry')
    expect(outcomeOf(err(undefined))).toBe('retry')
  })
})
