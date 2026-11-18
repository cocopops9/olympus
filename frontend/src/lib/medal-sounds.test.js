// @vitest-environment happy-dom
// The sound of each medal tier (lib/medal-sounds.js, played by lib/sound.js medalSound): five
// different sounds, each grander than the one below, none of them the record's. What is checked
// here is the data and how it is played; how it sounds was measured on the rendered audio (see
// the notes at the top of lib/medal-sounds.js).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MEDAL_SOUNDS, MEDAL_TIERS, medalSoundEnd } from './medal-sounds.js'
import { REST_SOUNDS } from './rest-sounds.js'
import { TIERS } from './medals.js'

const layers = snd => ['lyre', 'aulos', 'horn', 'drum'].filter(k => (snd[k] || []).length)
const notes = snd => layers(snd).reduce((n, k) => n + snd[k].length, 0)
const pitches = snd => new Set([...(snd.lyre || []).map(n => n[0]), ...(snd.horn || []).map(n => n[0]), ...(snd.aulos || []).map(n => n[0])])

describe('medal sounds, as data', () => {
  it('has one for every tier of lib/medals.js, in order', () => {
    expect(MEDAL_TIERS).toEqual(TIERS)
    expect(Object.keys(MEDAL_SOUNDS)).toEqual(TIERS)
  })

  it('every note is a real pitch at a real time', () => {
    for (const tier of TIERS) {
      const snd = MEDAL_SOUNDS[tier]
      expect(snd.gain, tier).toBeGreaterThan(0)
      expect(snd.gain, tier).toBeLessThanOrEqual(2)
      for (const [kind, list] of Object.entries(snd)) {
        if (kind === 'gain') continue
        expect(['lyre', 'aulos', 'horn', 'drum'], tier + ' ' + kind).toContain(kind)
        for (const note of list) {
          expect(note.every(Number.isFinite), tier + ' ' + JSON.stringify(note)).toBe(true)
          expect(note[0], tier).toBeGreaterThan(100)    // a phone speaker has nothing below this
          expect(note[0], tier).toBeLessThan(4000)
        }
      }
    }
  })

  it('grows with the tier: longer, more notes, more layers, never fewer', () => {
    const snds = TIERS.map(t => MEDAL_SOUNDS[t])
    for (let i = 1; i < snds.length; i++) {
      expect(medalSoundEnd(snds[i]), TIERS[i]).toBeGreaterThan(medalSoundEnd(snds[i - 1]))
      expect(notes(snds[i]), TIERS[i]).toBeGreaterThan(notes(snds[i - 1]))
      expect(layers(snds[i]).length, TIERS[i]).toBeGreaterThanOrEqual(layers(snds[i - 1]).length)
    }
    expect(layers(MEDAL_SOUNDS.bronze)).toEqual(['lyre'])
    expect(layers(MEDAL_SOUNDS.olympian)).toEqual(['lyre', 'aulos', 'horn', 'drum'])
  })

  it('the five sounds are all different from each other', () => {
    const seen = new Set(TIERS.map(t => JSON.stringify({ ...MEDAL_SOUNDS[t], gain: 0 })))
    expect(seen.size).toBe(TIERS.length)
  })

  it('none is the record\'s: no tier plays its rising lyre run, and the first notes differ', async () => {
    const { TRIUMPH } = await import('./sound.js')
    const run = TRIUMPH.lyre.map(n => n[0])
    for (const tier of TIERS) {
      const lyre = (MEDAL_SOUNDS[tier].lyre || []).slice().sort((a, b) => a[1] - b[1]).map(n => n[0])
      const text = lyre.join(',')
      expect(text.includes(run.join(',')), tier + ' plays the record\'s run').toBe(false)
      expect(JSON.stringify(MEDAL_SOUNDS[tier].horn || [])).not.toBe(JSON.stringify(TRIUMPH.salpinx))
    }
  })

  it('is not the end-of-rest sound either: that one is a falling aulos tetrachord of its own', () => {
    const rest = REST_SOUNDS.greek.notes.map(n => n[0])
    expect(rest).toEqual([...rest].sort((a, b) => b - a))   // it falls
    for (const tier of TIERS) {
      const snd = MEDAL_SOUNDS[tier]
      expect((snd.aulos || []).map(n => n[0]).join()).not.toBe(rest.join())
    }
  })

  it('the tiers share the key: every pitch is a note of D minor / the Dorian mode on D', () => {
    // D E F G A B C in any octave, plus the E6 of the olympian's trill.
    const okClass = new Set([0, 2, 3, 5, 7, 9, 10])   // semitones above D
    const d = 293.664767917
    for (const tier of TIERS) {
      for (const f of pitches(MEDAL_SOUNDS[tier])) {
        const semis = Math.round(12 * Math.log2(f / d))
        expect(okClass.has(((semis % 12) + 12) % 12), tier + ' ' + f).toBe(true)
      }
    }
  })
})

describe('medalSound', () => {
  // A context that only counts what it is asked to make.
  let made
  class Ctx {
    constructor() {
      made = { osc: 0, src: 0, comp: 0, buffers: 0, started: [] }
      this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}
    }
    resume() { return Promise.resolve() }
    suspend() { return Promise.resolve() }
    createGain() { return { connect() {}, gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} } } }
    createOscillator() { made.osc++; const p = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }; return { frequency: p, detune: { value: 0 }, connect() {}, start(at) { made.started.push(at) }, stop() {}, setPeriodicWave() {} } }
    createBiquadFilter() { return { frequency: { value: 0 }, Q: { value: 0 }, connect() {} } }
    createBuffer(c, n) { made.buffers++; return { getChannelData: () => new Float32Array(n) } }
    createBufferSource() { made.src++; return { connect() {}, start(at) { made.started.push(at) }, stop() {} } }
    createDynamicsCompressor() { made.comp++; const p = { value: 0 }; return { threshold: p, knee: p, ratio: p, attack: p, release: p, connect() {} } }
    createPeriodicWave() { return {} }
  }
  let sound
  beforeEach(async () => {
    made = null
    window.AudioContext = Ctx
    vi.resetModules()
    sound = await import('./sound.js')
  })

  it('makes no sound, not even a context, while Sounds is off', () => {
    sound.medalSound(false, 'gold')
    expect(made).toBe(null)
  })

  it('plays every note of the tier it is given: a string per lyre note, a reed per aulos, three oscillators per horn (two saws and the vibrato), two per drum', async () => {
    for (const tier of TIERS) {
      // The module keeps one context for the page: a fresh module gives each tier its own.
      vi.resetModules()
      window.AudioContext = Ctx
      const fresh = await import('./sound.js')
      fresh.medalSound(true, tier)
      const snd = MEDAL_SOUNDS[tier]
      expect({ src: made.src, osc: made.osc }, tier).toEqual({
        src: (snd.lyre || []).length,
        osc: (snd.aulos || []).length + 3 * (snd.horn || []).length + 2 * (snd.drum || []).length,
      })
      expect(made.comp, tier).toBe(1)
    }
  })

  it('an unknown tier plays bronze\'s', () => {
    sound.medalSound(true, 'unobtainium')
    expect(made.src).toBe(MEDAL_SOUNDS.bronze.lyre.length)
    expect(made.osc).toBe(0)
  })
})
