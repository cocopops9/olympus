// The coaches' offline voices (lib/local-voice.js): which voice a language reads with, and what is there.
import { describe, it, expect } from 'vitest'
import { voiceKey, availableVoice, hasLocalVoice, _setLocalVoices, _resetLocalVoices, kokoroLang, kokoroVoice, setupKey, KOKORO } from './local-voice.js'

describe('offline voices', () => {
  it('a language reads with its own voice, or its base language one', () => {
    expect(voiceKey('it')).toBe('it')
    expect(voiceKey('de-CH')).toBe('de')
    expect(voiceKey('pt-BR')).toBe('pt-BR')
    expect(voiceKey('pt')).toBe('pt')
    expect(voiceKey('zh-TW')).toBe(null)
  })
  it('knows what is published and what is on the phone', () => {
    _setLocalVoices({ voices: { it: { file: 'voice-it.zip', bytes: 30e6 } } }, ['it'])
    expect(availableVoice('it').file).toBe('voice-it.zip')
    expect(availableVoice('ko')).toBe(null)
    expect(hasLocalVoice('it')).toBe(true)
    expect(hasLocalVoice('es')).toBe(false)
    _resetLocalVoices()
    expect(hasLocalVoice('it')).toBe(false)
  })

  describe('the natural voices (Kokoro)', () => {
    const who = { chiron: { sid: 0, speed: 0.9 }, hercules: { sid: 1, speed: 1 }, athena: { sid: 2, speed: 1 }, calliope: { sid: 3, speed: 1 } }
    const manifest = {
      voices: { it: { file: 'voice-it.zip', bytes: 26e6 }, de: { file: 'voice-de.zip', bytes: 60e6 } },
      kokoro: { file: 'voice-kokoro.zip', bytes: 107e6, langs: { it: { espeak: 'it', who }, 'pt-BR': { espeak: 'pt-br', who }, en: { espeak: 'en-us', who } } },
    }
    it('are what a language they speak sets up; the others keep their Piper voice', () => {
      _setLocalVoices(manifest, [])
      expect(setupKey('it')).toBe(KOKORO)
      expect(setupKey('en')).toBe(KOKORO)
      expect(setupKey('de')).toBe('de')
      expect(availableVoice(KOKORO).file).toBe('voice-kokoro.zip')
      _resetLocalVoices()
    })
    it('read a regional tag with its language, but European Portuguese is not Brazilian', () => {
      _setLocalVoices(manifest, [])
      expect(kokoroLang('it-IT').espeak).toBe('it')
      expect(kokoroLang('en-GB').espeak).toBe('en-us')
      expect(kokoroLang('pt-BR').espeak).toBe('pt-br')
      expect(kokoroLang('pt')).toBe(null)
      expect(kokoroLang('pt-PT')).toBe(null)
      expect(kokoroLang('de')).toBe(null)
      _resetLocalVoices()
    })
    it('give each coach their own voice, only once they are on the phone', () => {
      _setLocalVoices(manifest, [])
      expect(kokoroVoice('chiron', 'it')).toBe(null)
      _setLocalVoices(manifest, [KOKORO])
      expect(kokoroVoice('chiron', 'it-IT')).toEqual({ sid: 0, speed: 0.9, voiceLang: 'it' })
      expect(kokoroVoice('athena', 'it')).toEqual({ sid: 2, speed: 1, voiceLang: 'it' })
      expect(kokoroVoice('nobody', 'it')).toBe(null)
      expect(kokoroVoice('chiron', 'de')).toBe(null)
      _resetLocalVoices()
    })
    it('ignore an entry the plugin would refuse', () => {
      _setLocalVoices({ kokoro: { langs: { it: { espeak: 'it; rm', who }, en: { espeak: 'en-us', who: { chiron: { sid: '0' } } } } } }, [KOKORO])
      expect(kokoroVoice('chiron', 'it')).toBe(null)
      expect(kokoroVoice('chiron', 'en')).toBe(null)
      _resetLocalVoices()
    })
  })
})
