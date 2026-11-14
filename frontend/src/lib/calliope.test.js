// Calliope, the guide (lib/calliope.js): what she says on the tour, how one of her answers is
// read, and what she is told about the person asking.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => vi.fn())
vi.mock('./api.js', () => ({ api }))

import { askCalliope, askErrorText, guideContext, parseReply, tourSteps, voiceOn, withVoice } from './calliope.js'

beforeEach(() => { api.mockReset() })

describe('the tour', () => {
  it('is short, ends on the choice, and points at something real on most steps', () => {
    const steps = tourSteps()
    expect(steps.length).toBeLessThanOrEqual(7)
    expect(steps.at(-1)).toMatchObject({ id: 'go', last: true })
    expect(steps.filter(s => s.target).length).toBeGreaterThanOrEqual(4)
    expect(new Set(steps.map(s => s.id)).size).toBe(steps.length)
    for (const s of steps) expect(s.text.length).toBeLessThan(200)
  })

  it('talks about the coaches only to a profile that has them', () => {
    expect(tourSteps().some(s => s.id === 'coach')).toBe(false)
    expect(tourSteps({ coach: true }).some(s => s.id === 'coach')).toBe(true)
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
