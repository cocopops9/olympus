// @vitest-environment happy-dom
// The coaches' offline voices as lib/voice.js uses them: the answer handed over in pieces with
// their pauses (lib/speech-text.js), the voice made ready ahead, one coach's stop leaving
// another's line alone, and how long Chiron waits on a line before he listens again.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ installed: new Set(['kokoro', 'en']), calls: [], warms: [], stops: 0, pending: [] }))
vi.mock('./mobile.js', async orig => ({ ...(await orig()), MOBILE: true }))
vi.mock('./api.js', async orig => ({ ...(await orig()), api: vi.fn(async () => ({ speak: false })) }))
vi.mock('./local-voice.js', () => ({
  localVoicesOn: () => true,
  hasLocalVoice: k => h.installed.has(k),
  voiceKey: () => 'en',
  coachVoices: () => null,
  coachesKey: () => null,
  audioNormal: () => {},
  stopLocal: () => { h.stops++ },
  warmLocal: v => { h.warms.push(v); return Promise.resolve({ loaded: true }) },
  speakLocal: (text, opts) => { h.calls.push({ text, ...opts }); return new Promise(r => h.pending.push(r)) },
}))

const voice = await import('./voice.js')
const { speechParts } = await import('./speech-text.js')

beforeEach(() => { h.calls = []; h.warms = []; h.stops = 0; h.pending.forEach(r => r({})); h.pending = []; h.installed = new Set(['kokoro', 'en']) })

describe('the offline voice', () => {
  it('is given the answer in pieces, each with its pause', async () => {
    const text = 'Squat tips:\n1. Keep your back straight\n2. Brace your core'
    voice.speak(text, { who: 'athena' })
    await vi.waitFor(() => expect(h.calls).toHaveLength(1))
    expect(h.calls[0].key).toBe('kokoro')
    expect(h.calls[0].parts).toEqual(speechParts(voice.speakable(text)))
    expect(h.calls[0].parts.map(p => p.text)).toEqual(['Squat tips:', 'Keep your back straight.', 'Brace your core.'])
  })

  it('is made ready ahead with the voice the coach will speak with', async () => {
    await voice.warmCoachVoice('chiron')
    expect(h.warms).toHaveLength(1)
    expect(h.warms[0]).toMatchObject({ key: 'kokoro', sid: 17, accent: '' })
  })

  it('with a line about to be said, has its first two pieces made ahead at the pace it will be said', async () => {
    await voice.warmCoachVoice('chiron', 'I am awake. Start an exercise and ask me anything about it. Third.')
    expect(h.warms).toHaveLength(1)
    expect(h.warms[0].parts.map(p => p.text)).toEqual(['I am awake.', 'Start an exercise and ask me anything about it.'])
    expect(h.warms[0]).toMatchObject({ key: 'kokoro', sid: 17, speed: 0.92, pitch: 0.94 })
  })

  it('falls back to the man’s Piper voice for Chiron when Kokoro is not on the phone', () => {
    h.installed = new Set(['en'])
    const list = voice.localVoices('chiron')
    expect(list.map(v => v.key)).toEqual(['en'])
    expect(voice.localVoices('athena')).toEqual([])
  })

  it('a stop for Calliope leaves a coach’s answer playing; a plain stop ends it', async () => {
    voice.speak('Rest two minutes, then 80 kg for 5 reps.', { who: 'chiron' })
    await vi.waitFor(() => expect(h.calls).toHaveLength(1))
    const before = h.stops
    await voice.stopSpeaking({ who: 'calliope' })
    expect(h.stops).toBe(before)
    await voice.stopSpeaking()
    expect(h.stops).toBe(before + 1)
  })
})

describe('speechGuardMs', () => {
  it('on the phone is a safety well past the time the words take, even made slowly', () => {
    const text = 'x'.repeat(200)
    // 200 characters last about 9 s (0.045 s each); made at twice real time, about 18 s.
    expect(voice.speechGuardMs(text, { reportsEnd: true })).toBeGreaterThan(2 * 0.33 * 1000 + 2 * 200 * 45 + 5000)
  })

  it('in a browser stays about the time the words take', () => {
    expect(voice.speechGuardMs('x'.repeat(100), { reportsEnd: false })).toBe(12000)
  })
})
