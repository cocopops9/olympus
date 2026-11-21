import { describe, expect, it } from 'vitest'
import { castVoice, voiceIdentity, kokoroLang, PIPER } from './voice-cast.js'

const LANGS = ['en', 'it', 'es', 'fr', 'de', 'pt', 'pt-BR', 'pl', 'tr', 'ru', 'uk', 'zh', 'zh-TW', 'hi', 'hu', 'ar', 'bn', 'ko', 'th']
const WHO = ['chiron', 'hercules', 'athena', 'calliope']

describe('every coach has a voice of their own, in every language', () => {
  it('four different voices per language', () => {
    for (const lang of LANGS) {
      const ids = WHO.map(w => voiceIdentity(castVoice(w, lang)))
      expect(new Set(ids).size, lang + ': ' + ids.join(' ')).toBe(4)
    }
  })
  it('Kokoro where it speaks the language, with the speaker ids of sherpa-onnx', () => {
    expect(castVoice('chiron', 'en')).toMatchObject({ engine: 'kokoro', sid: 17, accent: '' })
    expect(castVoice('athena', 'it')).toMatchObject({ engine: 'kokoro', sid: 35, accent: 'it' })
    expect(castVoice('hercules', 'pt-BR')).toMatchObject({ engine: 'kokoro', sid: 43, accent: 'pt-br' })
    expect(castVoice('calliope', 'zh-TW')).toMatchObject({ engine: 'kokoro', sid: 48 })
    expect(kokoroLang('de')).toBe(null)
    expect(castVoice('chiron', 'de').engine).toBe('before')
  })
  it('Chiron is the deepest voice wherever two men share a model', () => {
    for (const lang of LANGS) {
      const c = castVoice('chiron', lang), h = castVoice('hercules', lang)
      if (c.engine === h.engine && c.engine === 'before') expect(c.pitch).toBeLessThan(h.pitch)
      expect(c.pitch).toBeGreaterThanOrEqual(0.8)
    }
  })
  it('a coach\'s own Piper voice where Kokoro has none, kept apart from the others', () => {
    const own = { hercules: { model: 'm1', sid: 0 }, athena: { model: 'm2', sid: 0 }, calliope: { own: true, sid: 2, pitch: 1.05 } }
    expect(castVoice('hercules', 'de', own)).toEqual({ engine: PIPER, model: 'm1', sid: 0, speed: 1, pitch: 1 })
    expect(castVoice('calliope', 'de', own)).toEqual({ engine: PIPER, model: '', sid: 2, speed: 1, pitch: 1.05 })
    expect(castVoice('chiron', 'de', own).engine).toBe('before')
    const ids = WHO.map(w => voiceIdentity(castVoice(w, 'de', own)))
    expect(new Set(ids).size).toBe(4)
    // Kokoro first where it has the coach; a malformed entry is ignored.
    expect(castVoice('athena', 'it', own).engine).toBe('kokoro')
    expect(castVoice('hercules', 'ru', { hercules: { model: '../x', sid: 0 } }).engine).toBe('before')
    expect(castVoice('hercules', 'ru', { hercules: { model: 'm1', sid: -1 } }).engine).toBe('before')
  })
})
