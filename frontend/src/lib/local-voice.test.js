// The coaches' offline voices (lib/local-voice.js): which voice a language reads with, and what is there.
import { describe, it, expect } from 'vitest'
import { voiceKey, availableVoice, hasLocalVoice, _setLocalVoices, _resetLocalVoices } from './local-voice.js'

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
})
