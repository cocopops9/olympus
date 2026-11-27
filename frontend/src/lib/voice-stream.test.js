// @vitest-environment happy-dom
// The coaches' voice as the server makes it (lib/voice.js speakStreamed): one request for the whole
// answer, played from its first chunks, in order and without gaps; a server that cannot stream gets
// the whole pieces, as before.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => vi.fn())
const apiStream = vi.hoisted(() => vi.fn())
vi.mock('./api.js', async orig => ({ ...(await orig()), api, apiStream }))

const RATE = 24000
let started = []
class FakeContext {
  constructor() { this.t0 = performance.now(); this.state = 'running'; this.destination = {} }
  get currentTime() { return (performance.now() - this.t0) / 1000 }
  resume() { return Promise.resolve() }
  createBuffer(_ch, n, rate) { const d = new Float32Array(n); return { length: n, duration: n / rate, getChannelData: () => d } }
  createBufferSource() { const s = { connect() {}, stop() {}, start(when) { started.push({ when, n: s.buffer.length, dur: s.buffer.duration }) } }; return s }
}

// 0.3 s of sound, sent in three chunks cut at odd places.
function body() {
  const bytes = new Uint8Array(0.3 * RATE * 2)
  const cuts = [0, 1001, 9001, bytes.length]
  return new ReadableStream({ start(c) { for (let i = 0; i < 3; i++) c.enqueue(bytes.slice(cuts[i], cuts[i + 1])); c.close() } })
}

async function fresh() {
  vi.resetModules()
  api.mockReset(); apiStream.mockReset()
  api.mockImplementation(async url => (url === '/api/voice' ? { speak: true, who: ['chiron', 'hercules', 'athena', 'calliope'], listen: true } : { audio: 'QUJD', type: 'audio/wav' }))
  const voice = await import('./voice.js')
  await voice.warmVoice()
  return voice
}

beforeEach(() => { started = []; vi.stubGlobal('AudioContext', FakeContext); window.AudioContext = FakeContext })

describe('the voice as it is made', () => {
  it('asks once for the whole answer and plays every sample of it, in order and back to back', async () => {
    const voice = await fresh()
    apiStream.mockResolvedValue({ headers: { get: () => 'audio/L16;rate=24000' }, body: body() })
    let begun = false
    await voice.speak('Rest two minutes. Then 80 kg for 8 reps, and keep one rep in reserve.', { who: 'chiron', lang: 'en-US', onStart: () => { begun = true } })
    expect(apiStream).toHaveBeenCalledTimes(1)
    expect(apiStream.mock.calls[0][0]).toBe('/api/voice/stream')
    expect(apiStream.mock.calls[0][1].text).toBe('Rest two minutes. Then 80 kg for 8 reps, and keep one rep in reserve.')
    expect(api.mock.calls.filter(c => c[0] === '/api/voice/speak')).toEqual([])
    expect(begun).toBe(true)
    // Every sample, the odd bytes between chunks put back together.
    expect(started.reduce((n, s) => n + s.n, 0)).toBe(0.3 * RATE)
    for (let i = 1; i < started.length; i++) expect(started[i].when).toBeCloseTo(started[i - 1].when + started[i - 1].dur, 6)
  })

  it('a server that cannot stream: the whole pieces, and the stream is not asked for again', async () => {
    const voice = await fresh()
    apiStream.mockRejectedValue(Object.assign(new Error('this voice does not stream'), { status: 501 }))
    class FakeAudio { constructor() { setTimeout(() => this.onended?.(), 0) } play() { return Promise.resolve() } pause() {} }
    vi.stubGlobal('Audio', FakeAudio)
    await voice.speak('Rest two minutes.', { who: 'chiron', lang: 'en-US' })
    expect(api.mock.calls.filter(c => c[0] === '/api/voice/speak').length).toBe(1)
    await voice.speak('Then 80 kg.', { who: 'chiron', lang: 'en-US' })
    expect(apiStream).toHaveBeenCalledTimes(1)
  })

  it('turns 16-bit PCM into samples', async () => {
    const { pcmSamples } = await import('./voice.js')
    expect([...pcmSamples(new Uint8Array([0, 0, 0, 64, 0, 192]))]).toEqual([0, 0.5, -0.5])
  })
})

describe('the short word said the moment the question is sent', () => {
  it('is asked of the server once ahead, in the language of the question, and played only when ready', async () => {
    const voice = await fresh()
    const played = []
    vi.stubGlobal('Audio', class { constructor(src) { this.src = src; played.push(this) } play() { setTimeout(() => this.onended?.(), 0); return Promise.resolve() } pause() {} })
    // Not prepared yet: nothing is said (a word after the answer would be worse than none), and it is asked for.
    expect(await voice.sayFiller('chiron', 'en')).toBe(false)
    await voice.prepareFiller('chiron', 'en')
    const asks = api.mock.calls.filter(c => c[0] === '/api/voice/speak').map(c => JSON.parse(c[1].body).text)
    expect(asks).toEqual(['Let me see.'])
    expect(await voice.sayFiller('chiron', 'en-US')).toBe(true)
    expect(played).toHaveLength(1)
    expect(voice.fillerText('it')).toBe('Vediamo.')
    expect(voice.fillerText('xx')).toBe('')
    vi.unstubAllGlobals()
  })
})
