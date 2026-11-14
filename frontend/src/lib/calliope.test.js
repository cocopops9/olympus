// Calliope, the guide (lib/calliope.js): what she says on the tour, how one of her answers is
// read, and what she is told about the person asking.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => vi.fn())
vi.mock('./api.js', () => ({ api }))

import { SCREEN_TOURS, askCalliope, askErrorText, guideContext, parseReply, tourFor, voiceOn, withVoice } from './calliope.js'

beforeEach(() => { api.mockReset() })

describe('the tours', () => {
  const has = present => sel => present.includes(sel)

  it('each screen has a short tour of its own, in a few bubbles', () => {
    for (const [id, tour] of Object.entries(SCREEN_TOURS)) {
      const steps = tour.steps()
      expect(steps.length, id).toBeGreaterThanOrEqual(2)
      expect(steps.length, id).toBeLessThanOrEqual(7)
      expect(new Set(steps.map(s => s.id)).size, id).toBe(steps.length)
      for (const step of steps) {
        expect(step.target, id + '/' + step.id).toBeTruthy()
        expect(step.text.length, id + '/' + step.id).toBeLessThan(220)
      }
      expect(['basic', 'analysis']).toContain(tour.kind)
    }
    expect(Object.keys(SCREEN_TOURS)).toEqual(expect.arrayContaining(['home', 'workoutStart', 'workout', 'plan', 'profile', 'stats', 'library']))
  })

  it('leaves out a step whose button is not on screen, and keeps the others', () => {
    const home = tourFor('home', { has: has(['#tabbar .start', '#tabbar > button:last-child', '.cal-help']) })
    expect(home.map(s => s.id)).toEqual(['start', 'profile', 'me'])
    const withCoach = tourFor('home', { has: () => true })
    expect(withCoach.map(s => s.id)).toContain('coach')
  })

  it('waits for a screen that has nothing to show yet', () => {
    expect(tourFor('stats', { has: has([]) })).toEqual([])
    expect(tourFor('workout', { has: has(['.whdr-finish']) })).toEqual([])
    expect(tourFor('workout', { has: has(['.setrow', '.setrow .n', '.exhd .iconbtn:last-child', '.whdr-finish']) }).map(s => s.id)).toEqual(['set', 'kind', 'menu', 'finish'])
    expect(tourFor('nowhere')).toEqual([])
  })

  it('the numbers screens are for everyone who wants help, the rest for newcomers', () => {
    expect(SCREEN_TOURS.stats.kind).toBe('analysis')
    expect(SCREEN_TOURS.workout.kind).toBe('basic')
  })
})

describe('her voice', () => {
  it('is on until switched off, and the switch writes a new map', () => {
    const hints = { guide: 'new' }
    expect(voiceOn({ hints })).toBe(true)
    const off = withVoice(hints, false)
    expect(off).not.toBe(hints)
    expect(voiceOn({ hints: off })).toBe(false)
    expect(withVoice(off, true)).toEqual({ guide: 'new' })
    expect(voiceOn({})).toBe(true)
  })
})

describe('an answer', () => {
  it('gives up its last line when it names a screen to go to', () => {
    expect(parseReply('Open Profile, then Plan.\nGO: plan')).toEqual({ text: 'Open Profile, then Plan.', go: '/plan' })
    expect(parseReply('Units are in Settings.\n\nGO: settings/units.')).toEqual({ text: 'Units are in Settings.', go: '/settings/units' })
  })

  it('goes nowhere for a screen she does not know, and keeps the words', () => {
    expect(parseReply('Try this.\nGO: admin')).toEqual({ text: 'Try this.', go: null })
    expect(parseReply('Just words.')).toEqual({ text: 'Just words.', go: null })
    expect(parseReply('We GO: far together')).toEqual({ text: 'We GO: far together', go: null })
  })

  it('loses its markdown: it is read aloud', () => {
    expect(parseReply('Tap **New routine**, then `Save`.').text).toBe('Tap New routine, then Save.')
  })
})

describe('asking', () => {
  it('sends the conversation, the language and where the person is', async () => {
    api.mockResolvedValue({ reply: 'Open Plan.\nGO: plan', left: 29 })
    const S = { workouts: [], routines: [{ id: 'r' }], unit: 'kg', active: null }
    const r = await askCalliope([{ role: 'user', content: 'How do I plan my week?', go: null }], { S, path: '/plan/r/1' })
    expect(r).toEqual({ text: 'Open Plan.', go: '/plan', left: 29 })
    const [url, init] = api.mock.calls[0]
    expect(url).toBe('/api/calliope')
    const body = JSON.parse(init.body)
    expect(body.messages).toEqual([{ role: 'user', content: 'How do I plan my week?' }])
    expect(body.context).toContain('Screen open now: Plan.')
    expect(body.context).toContain('No workout logged yet.')
    expect(body.context).toContain('Routines: 1.')
  })

  it('says a workout is in progress, and counts what was logged', () => {
    const text = guideContext({ active: { start: 1 }, workouts: [{}, {}], routines: [] }, '/workout')
    expect(text).toContain('Screen open now: Workout.')
    expect(text).toContain('A workout is in progress.')
    expect(text).toContain('Workouts logged: 2.')
    expect(text).toContain('No routine yet.')
  })

  it('has words for each way of not answering', () => {
    const limit = askErrorText({ status: 429, data: { code: 'hercules-limit' } })
    const off = askErrorText({ status: 404 })
    const other = askErrorText(new Error('offline'))
    expect(new Set([limit, off, other]).size).toBe(3)
  })
})
