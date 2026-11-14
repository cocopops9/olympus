// @vitest-environment happy-dom
// The guide's voice (lib/voice.js): her lines go to the server only once it says it has her
// voice, are asked for ahead of time, and are marked as fixed lines the server may keep.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => vi.fn())
vi.mock('./api.js', async orig => ({ ...(await orig()), api }))

const speakCalls = () => api.mock.calls.filter(c => c[0] === '/api/voice/speak').map(c => JSON.parse(c[1].body))
async function fresh(status) {
  vi.resetModules()
  api.mockReset()
  api.mockImplementation(async url => (url === '/api/voice' ? status : { audio: 'QUJD', type: 'audio/wav' }))
  const voice = await import('./voice.js')
  await voice.warmVoice()
  return voice
}

beforeEach(() => { api.mockReset() })

describe('the guide’s lines on the server', () => {
  it('a server from before her has the coaches only: nothing of hers is sent to it', async () => {
    const voice = await fresh({ speak: true, listen: true })
    voice.preloadVoice('Welcome to Olympus!', { who: 'calliope', keep: true, lang: 'en-US' })
    expect(speakCalls()).toEqual([])
    voice.preloadVoice('Rest two minutes.', { who: 'chiron', lang: 'en-US' })
    expect(speakCalls().length).toBe(1)
  })

  it('a server that has her voice is asked ahead, once a line, and told the line may be kept', async () => {
    const voice = await fresh({ speak: true, who: ['chiron', 'hercules', 'athena', 'calliope'], listen: true })
    voice.preloadVoice('Welcome to Olympus!', { who: 'calliope', keep: true, lang: 'en-US' })
    voice.preloadVoice('Welcome to Olympus!', { who: 'calliope', keep: true, lang: 'en-US' })
    expect(speakCalls()).toEqual([{ text: 'Welcome to Olympus!', lang: 'en-US', who: 'calliope', keep: true }])
  })

  it('nothing is asked of a server with no voice at all', async () => {
    const voice = await fresh({ speak: false, who: ['calliope'] })
    voice.preloadVoice('Welcome to Olympus!', { who: 'calliope', keep: true })
    expect(speakCalls()).toEqual([])
  })
})
