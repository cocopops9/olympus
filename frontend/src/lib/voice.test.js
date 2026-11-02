// @vitest-environment happy-dom
// Talking to the coaches (lib/voice.js): what is read aloud, and the language tags.
import { describe, expect, it } from 'vitest'
import { speakable, voiceTag } from './voice.js'
import { activityByDay, levelFor, tiersFor } from '../components/Activity.jsx'

describe('voice', () => {
  it('reads the answer without Markdown, links or action blocks', () => {
    const text = '**Bench** 4x6.\n- Rest *2 min*\n[guide](https://x.test)\n```olympus-action\n{"type":"set_rest"}\n```'
    expect(speakable(text)).toBe('Bench 4x6.\nRest 2 min\nguide')
  })
  it('gives a recogniser tag for every app language, English otherwise', () => {
    expect(voiceTag('it')).toBe('it-IT')
    expect(voiceTag('pt-BR')).toBe('pt-BR')
    expect(voiceTag('xx')).toBe('en-US')
  })
})

describe('activity', () => {
  it('adds up each day, and levels days against the quartiles', () => {
    const w = (d, min) => ({ d, start: Date.parse(d + 'T10:00:00'), end: Date.parse(d + 'T10:00:00') + min * 60000, entries: [] })
    const agg = activityByDay([w('2026-10-01', 30), w('2026-10-01', 30), w('2026-10-02', 90)])
    expect(agg['2026-10-01']).toMatchObject({ n: 2, min: 60 })
    const level = levelFor([60, 90, 30, 120])
    expect(level(120)).toBe(4)
    expect(level(30)).toBe(1)
    expect(level(undefined)).toBe(0)
  })
  it('splits the month calendar in three tiers with the real range of each', () => {
    const { level, ranges } = tiersFor([20, 30, 40, 50, 60, 70, 80, 90, 100])
    expect(ranges.map(r => [r.level, r.lo, r.hi])).toEqual([[1, 20, 40], [2, 50, 70], [3, 80, 100]])
    expect(level(25)).toBe(1)
    expect(level(100)).toBe(3)
    expect(level(0)).toBe(0)
    // Two distinct values: light and full, no medium.
    expect(tiersFor([30, 30, 90, 90]).ranges.map(r => r.level)).toEqual([1, 3])
    expect(tiersFor([45]).ranges).toEqual([{ level: 1, lo: 45, hi: 45 }])
    expect(tiersFor([]).ranges).toEqual([])
  })
})

import { pickVoice } from './voice.js'
describe('a voice for each character', () => {
  const phone = [
    { name: 'en-us-x-sfg-local', lang: 'en-US' },
    { name: 'it-it-x-itb-local', lang: 'it-IT' },
    { name: 'it-it-x-itd-network', lang: 'it-IT' },
    { name: 'it-it-x-itd-local', lang: 'it-IT' },
    { name: 'es-es-x-eed-local', lang: 'es-ES' },
  ]
  it('picks a man’s voice for the language, offline first', () => {
    expect(pickVoice(phone, 'it-IT', true)).toBe(3)
    expect(pickVoice(phone, 'es-ES', true)).toBe(4)
    expect(pickVoice(phone, 'it-IT', false)).toBe(1)
  })
  it('none of the kind: -1, and the pitch does the rest', () => {
    expect(pickVoice(phone, 'en-US', true)).toBe(-1)
    expect(pickVoice([], 'fr-FR', true)).toBe(-1)
  })
  it('reads the browser’s voices by name', () => {
    expect(pickVoice([{ name: 'Microsoft Zira', lang: 'en-US' }, { name: 'Google UK English Male', lang: 'en-GB' }], 'en-GB', true)).toBe(1)
  })
})

import { pieces } from './voice.js'
describe('reading in pieces', () => {
  it('the first sentence alone, so it is heard at once; the rest in bigger pieces', () => {
    const p = pieces('Rest two minutes. Then 100 kg for 5. Keep your back straight. Breathe out as you push.')
    expect(p[0]).toBe('Rest two minutes.')
    expect(p.join(' ')).toBe('Rest two minutes. Then 100 kg for 5. Keep your back straight. Breathe out as you push.')
    expect(p.length).toBe(2)
  })
  it('a long sentence is cut', () => {
    expect(pieces('a'.repeat(500), 240).every(x => x.length <= 240)).toBe(true)
  })
})
