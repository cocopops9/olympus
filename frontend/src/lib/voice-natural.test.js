// @vitest-environment happy-dom
// The natural voices on the phone (lib/voice.js speak, lib/local-voice.js): where they are installed
// for the language, each of the four reads with a voice of its own, before the server's voice and
// the Piper one; a failure falls through to the next voice.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ local: [], fail: false, api: vi.fn() }))
vi.mock('./mobile.js', async orig => ({ ...(await orig()), MOBILE: true }))
vi.mock('./api.js', async orig => ({ ...(await orig()), api: m.api }))
vi.mock('./local-voice.js', async orig => {
  const real = await orig()
  return {
    ...real,
    localVoicesOn: () => true,
    stopLocal: async () => {},
    audioNormal: () => {},
    speakLocal: vi.fn(async (text, opts) => { m.local.push({ text, ...opts, onStart: undefined }); if (m.fail) throw new Error('engine') }),
  }
})
vi.mock('@capacitor-community/text-to-speech', () => ({ TextToSpeech: { speak: vi.fn(async () => {}), stop: vi.fn(async () => {}), getSupportedVoices: async () => ({ voices: [] }) } }))
import { speak } from './voice.js'
import { _setLocalVoices, KOKORO } from './local-voice.js'
import { setLang } from './i18n.js'

const who = { chiron: { sid: 0, speed: 0.9 }, hercules: { sid: 1, speed: 1 }, athena: { sid: 2, speed: 1 }, calliope: { sid: 3, speed: 1 } }
beforeEach(async () => {
  await setLang('it')
  m.local = []; m.fail = false
  m.api.mockReset(); m.api.mockRejectedValue(Object.assign(new Error('off'), { status: 501 }))
  _setLocalVoices({ voices: { it: { file: 'voice-it.zip', sid: 0 } }, kokoro: { file: 'voice-kokoro.zip', langs: { it: { espeak: 'it', who } } } }, [KOKORO, 'it'])
})

describe('the natural voices', () => {
  it('give each of the four a voice of their own, Athena and Calliope included', async () => {
    for (const w of ['chiron', 'hercules', 'athena', 'calliope']) await speak('Ciao.', { who: w, lang: 'it-IT' })
    expect(m.local.map(x => [x.key, x.sid, x.voiceLang])).toEqual([[KOKORO, 0, 'it'], [KOKORO, 1, 'it'], [KOKORO, 2, 'it'], [KOKORO, 3, 'it']])
    expect(m.local[0].speed).toBeCloseTo(0.9)
  })
  it('a failure falls through to the Piper voice for a man', async () => {
    m.fail = true
    await speak('Ciao.', { who: 'chiron', lang: 'it-IT' })
    expect(m.local.map(x => x.key)).toEqual([KOKORO, 'it'])
  })
  it('a language they do not speak keeps the Piper voice', async () => {
    await setLang('de')
    _setLocalVoices({ voices: { de: { file: 'voice-de.zip', sid: 0 } }, kokoro: { file: 'voice-kokoro.zip', langs: { it: { espeak: 'it', who } } } }, [KOKORO, 'de'])
    await speak('Hallo.', { who: 'hercules', lang: 'de-DE' })
    expect(m.local.map(x => x.key)).toEqual(['de'])
  })
})
