// @vitest-environment happy-dom
// The recorder's early transcription (lib/voice.js): the clip goes to the server after a short
// silence, so the answer is ready when the pause ends, and a finished sentence ends the wait sooner.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls = []
let reply = () => ({ text: 'hello' })
vi.mock('./api.js', () => ({
  api: vi.fn(async (path, opts) => { calls.push({ path, body: JSON.parse(opts.body) }); return reply(calls.length) }),
}))

let level = 0
beforeEach(() => {
  vi.useFakeTimers()
  calls.length = 0
  level = 0
  const track = { readyState: 'live', stop() {} }
  globalThis.navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [track] }) }
  window.MediaRecorder = class {
    static isTypeSupported() { return true }
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm' }
    start() { this.state = 'recording'; this.ondataavailable?.({ data: new Blob([new Uint8Array(4000)]), size: 4000 }) }
    stop() { this.state = 'inactive'; Promise.resolve().then(() => this.onstop?.()) }
  }
  // A reader that answers at once: the real one waits on timers the fake clock does not drive.
  globalThis.FileReader = class {
    readAsDataURL() { this.result = 'data:audio/webm;base64,AAAA'; Promise.resolve().then(() => this.onload?.()) }
  }
  window.AudioContext = class {
    constructor() { this.sampleRate = 48000 }
    createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: a => a.fill(level) } }
    createMediaStreamSource() { return { connect() {} } }
    createScriptProcessor() { throw new Error('none') }
    resume() { return Promise.resolve() }
    close() {}
  }
})
afterEach(() => { vi.useRealTimers() })

const start = async () => {
  vi.resetModules()
  const { listen, LISTEN } = await import('./voice.js')
  const out = { texts: [], ended: false }
  const stop = await listen({ onText: (t, final) => { if (final) out.texts.push(t) }, onEnd: () => { out.ended = true }, lang: 'en-US' })
  return { out, stop, LISTEN }
}
const run = ms => vi.advanceTimersByTimeAsync(ms)

describe('early transcription', () => {
  it('sends the clip after a short silence and reuses it when the pause ends', async () => {
    const { out, LISTEN } = await start()
    await run(LISTEN.calibrateMs + 100)
    level = 0.2
    await run(600)
    level = 0
    await run(LISTEN.specMs + 300)
    expect(calls.length).toBe(1)
    await run(LISTEN.earlyPauseMs + 500)
    expect(out.ended).toBe(true)
    expect(out.texts).toEqual(['hello'])
    expect(calls.length).toBe(1)
  })

  it('asks again when more was said after the early request', async () => {
    const { out, LISTEN } = await start()
    await run(LISTEN.calibrateMs + 100)
    level = 0.2
    await run(500)
    level = 0
    await run(LISTEN.specMs + 300)
    expect(calls.length).toBe(1)
    level = 0.2
    await run(500)
    level = 0
    await run(LISTEN.earlyPauseMs + 800)
    expect(out.ended).toBe(true)
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })

  it('ends the wait early when the first text is a finished sentence', async () => {
    reply = () => ({ text: 'What should I train today?' })
    const { out, LISTEN } = await start()
    await run(LISTEN.calibrateMs + 100)
    level = 0.2
    await run(600)
    level = 0
    await run(LISTEN.sentenceMs + 400)
    expect(out.ended).toBe(true)
    expect(out.texts).toEqual(['What should I train today?'])
    expect(calls.length).toBe(1)
    reply = () => ({ text: 'hello' })
  })

  it('does not end early on an unfinished sentence', async () => {
    reply = () => ({ text: 'What should I train' })
    const { out, LISTEN } = await start()
    await run(LISTEN.calibrateMs + 100)
    level = 0.2
    await run(600)
    level = 0
    await run(LISTEN.sentenceMs + 400)
    expect(out.ended).toBe(false)
    await run(LISTEN.earlyPauseMs)
    expect(out.ended).toBe(true)
    reply = () => ({ text: 'hello' })
  })
})

describe('endsSentence', () => {
  it('wants three words and a closing mark', async () => {
    const { endsSentence } = await import('./voice.js')
    expect(endsSentence('What should I train today?')).toBe(true)
    expect(endsSentence('Add squats to my plan.')).toBe(true)
    expect(endsSentence('What should I train')).toBe(false)
    expect(endsSentence('Yes.')).toBe(false)
    expect(endsSentence('')).toBe(false)
  })
})
