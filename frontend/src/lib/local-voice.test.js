// The coaches' offline voices (lib/local-voice.js): which voice a language reads with, and what is there.
import { describe, it, expect } from 'vitest'
import { voiceKey, availableVoice, hasLocalVoice, coachVoices, coachesKey, _setLocalVoices, _resetLocalVoices } from './local-voice.js'

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
  it('the coaches\' own voices of a language: a pack to download, or another speaker of its own voice', () => {
    const who = { hercules: { model: 'm1', sid: 0 }, athena: { model: 'm2', sid: 0 } }
    _setLocalVoices({ voices: { de: { file: 'voice-de.zip' }, uk: { file: 'voice-uk.zip', sid: 1 } }, coaches: {
      de: { file: 'voice-coaches-de.zip', bytes: 42e6, who },
      uk: { who: { athena: { own: true, sid: 2 } }, models: [] },
    } }, ['de'])
    expect(coachVoices('de-AT')).toEqual(who)
    expect(coachesKey('de')).toBe('coaches-de')
    expect(availableVoice('coaches-de').bytes).toBe(42e6)
    // Ukrainian has no pack: Athena is another speaker of the language's own voice.
    expect(coachesKey('uk')).toBe(null)
    expect(availableVoice('coaches-uk')).toBe(null)
    expect(coachVoices('uk').athena).toEqual({ own: true, sid: 2 })
    expect(coachVoices('fr')).toBe(null)
    _resetLocalVoices()
  })
})
