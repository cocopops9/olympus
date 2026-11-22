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

describe('the end of a question', () => {
  const startHeard = async () => {
    vi.resetModules()
    const { listen, LISTEN } = await import('./voice.js')
    const out = { order: [], text: null }
    await listen({ onHeard: () => out.order.push('heard'), onText: (t, final) => { if (final) out.text = t }, onEnd: () => out.order.push('end'), lang: 'en-US' })
    return { out, LISTEN }
  }

  it('says it is being written out once the person stops, before the text comes', async () => {
    reply = () => ({ text: 'What should I train today?' })
    const { out, LISTEN } = await startHeard()
    await run(LISTEN.calibrateMs + 100)
    level = 0.2
    await run(600)
    level = 0
    // A finished sentence ends about a second after the last word, not two or more.
    await run(1200)
    expect(out.order).toEqual(['heard', 'end'])
    expect(out.text).toBe('What should I train today?')
    reply = () => ({ text: 'hello' })
  })

  it('does not say so when nothing was said', async () => {
    const { out, LISTEN } = await startHeard()
    await run(LISTEN.nothingMs + 500)
    expect(out.order).toEqual(['end'])
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

describe('the end of a question in a room that gets louder', () => {
  it('is heard when the phone raises the noise after the last word, instead of listening on to the limit', async () => {
    const { out, LISTEN } = await start()
    level = 0.003   // a quiet room while it is measured
    await run(LISTEN.calibrateMs + 100)
    level = 0.08    // the question
    await run(1500)
    level = 0.03    // after it, the automatic gain lifts the room's noise far over the first measure
    await run(LISTEN.floorMs + LISTEN.pauseMs + 1000)
    expect(out.ended).toBe(true)
    expect(calls.length).toBeGreaterThan(0)
  })

  it('a steady question is not cut short: speech never becomes the floor while its pauses are there', async () => {
    const { out, LISTEN } = await start()
    level = 0.003
    await run(LISTEN.calibrateMs + 100)
    // Ten seconds of speech: 400 ms of voice, 150 ms between words.
    for (let i = 0; i < 18; i++) { level = 0.08; await run(400); level = 0.004; await run(150) }
    expect(out.ended).toBe(false)
  })
})
