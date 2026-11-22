// @vitest-environment happy-dom
// The coaches' offline voices as lib/voice.js uses them: the answer handed over in pieces with
// their pauses (lib/speech-text.js), the voice made ready ahead, one coach's stop leaving
// another's line alone, and how long Chiron waits on a line before he listens again.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ installed: new Set(['kokoro', 'en']), calls: [], warms: [], stops: 0, pending: [], measured: 0.5 }))
vi.mock('./mobile.js', async orig => ({ ...(await orig()), MOBILE: true }))
vi.mock('./api.js', async orig => ({ ...(await orig()), api: vi.fn(async () => ({ speak: false })) }))
vi.mock('./local-voice.js', () => ({
  localVoicesOn: () => true,
  hasLocalVoice: k => h.installed.has(k),
  voiceKey: (l = 'en') => String(l).split('-')[0],
  coachVoices: () => null,
  coachesKey: () => null,
  audioNormal: () => {},
  stopLocal: () => { h.stops++ },
  warmLocal: v => { h.warms.push(v); return Promise.resolve(v.measure ? { rtf: h.measured, measured: true } : { loaded: true }) },
  speakLocal: (text, opts) => { h.calls.push({ text, ...opts }); return new Promise(r => h.pending.push(r)) },
  // How fast Kokoro is on this phone (lib/voice.js measureVoices), when the test measures it.
}))

const voice = await import('./voice.js')
const { speechParts } = await import('./speech-text.js')

// Kokoro measured fast enough on this phone, unless a test says otherwise.
const measuredKokoro = rtf => { localStorage.setItem('olympus_voice_speed', JSON.stringify({ kokoro: { rtf, at: Date.now() } })); voice._resetVoiceSpeeds() }
beforeEach(() => { h.calls = []; h.warms = []; h.stops = 0; h.pending.forEach(r => r({})); h.pending = []; h.installed = new Set(['kokoro', 'en']); h.measured = 0.5; measuredKokoro(0.5) })

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

describe('the language a line is read in', () => {
  // The app is in English (the tests' language); the person speaks Italian, so the coach answers in Italian.
  const italian = 'Oggi hai fatto un ottimo lavoro sulla panca: tre serie da otto ripetizioni. La prossima volta aggiungi 2,5 kg.'

  it('is the language the answer is written in, not the app\'s', async () => {
    voice.speak(italian, { who: 'athena' })
    await vi.waitFor(() => expect(h.calls).toHaveLength(1))
    expect(h.calls[0]).toMatchObject({ key: 'kokoro', sid: 35, accent: 'it' })
  })

  it('takes the man\'s Piper voice of that language, never the app language\'s', async () => {
    h.installed = new Set(['en', 'it'])
    voice.speak(italian, { who: 'hercules' })
    await vi.waitFor(() => expect(h.calls).toHaveLength(1))
    expect(h.calls[0].key).toBe('it')
    h.installed = new Set(['en'])
    expect(voice.localVoices('hercules', null, { lang: 'it' })).toEqual([])
  })

  it('is made ready ahead in that language too', async () => {
    await voice.warmCoachVoice('chiron', italian)
    expect(h.warms[0]).toMatchObject({ key: 'kokoro', sid: 36, accent: 'it' })
  })

  it('stays the app\'s when the line says too little', async () => {
    voice.speak('Bench press 3x8', { who: 'athena' })
    await vi.waitFor(() => expect(h.calls).toHaveLength(1))
    expect(h.calls[0]).toMatchObject({ key: 'kokoro', sid: 3, accent: '' })
  })
})

describe('a voice too slow for the phone', () => {
  it('is left out: Kokoro slower than real time gives way to the man’s Piper voice, and Athena to the next voice', () => {
    measuredKokoro(1.6)
    expect(voice.localVoices('chiron').map(v => v.key)).toEqual(['en'])
    expect(voice.localVoices('athena')).toEqual([])
  })

  it('Kokoro not yet measured on this phone is not used; once measured fast enough it is', () => {
    localStorage.removeItem('olympus_voice_speed'); voice._resetVoiceSpeeds()
    expect(voice.localVoices('athena')).toEqual([])
    measuredKokoro(voice.FAST_RTF)
    expect(voice.localVoices('athena').map(v => v.key)).toEqual(['kokoro'])
  })

  it('is measured when not known, and the measurement decides', async () => {
    localStorage.removeItem('olympus_voice_speed'); voice._resetVoiceSpeeds()
    h.measured = 2.1
    await voice.measureVoices()
    expect(h.warms.at(-1)).toMatchObject({ key: 'kokoro', measure: true })
    expect(voice.voiceSpeed('kokoro').rtf).toBe(2.1)
    expect(voice.localVoices('chiron').map(v => v.key)).toEqual(['en'])
    // Known and recent: not measured again.
    const before = h.warms.length
    await voice.measureVoices()
    expect(h.warms).toHaveLength(before)
  })

  it('learns from what each answer measured', async () => {
    voice.speak('Rest two minutes.', { who: 'athena' })
    await vi.waitFor(() => expect(h.calls).toHaveLength(1))
    h.pending.shift()({ rtf: 1.4, measured: true })
    await vi.waitFor(() => expect(voice.voiceSpeed('kokoro').rtf).toBe(1.4))
    expect(voice.localVoices('athena')).toEqual([])
    // A result that measured nothing (every piece too short) changes nothing.
    voice.noteVoiceSpeed('en', { rtf: 1, measured: false })
    expect(voice.voiceSpeed('en')).toBe(null)
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
