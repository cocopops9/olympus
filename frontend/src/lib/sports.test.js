import { describe, it, expect } from 'vitest'
import { SPORTS, DRILLS, CATALOGUE_DRAWING, drillsOf, SPORT_MINUTES_PER_SET, QUALITIES, setsEquivalent } from './sports.js'
import { CATALOGUE, EXIDX, isCardio, isSport, categoriesOf } from './exercises.js'
import { modeOf, defaultConfig, setLabel, exLine } from './history.js'
import { MUSCLES, musclesOf, loadOfWorkouts, loadOfRoutine } from './muscles.js'
import { GROUPS, exercisesFor, countsFor } from './exercise-guide.js'
import { exerciseNameFor, descFor } from './i18n-core.js'
import { imgSrc, gifSrc } from './exercises.js'
import { sportStill, sportClip, sportAnimation } from './sport-media.js'

// A sport or drill drawn by the catalogue shows that exercise's files; the others ship their own.
function expectDrawing(ex) {
  if (ex.media) {
    expect(imgSrc(ex), ex.id).toBe(imgSrc(EXIDX[ex.media]))
    expect(gifSrc(ex), ex.id).toBe(gifSrc(EXIDX[ex.media]))
    return
  }
  expect(sportStill(ex.id), ex.id).toMatch(/\.webp/)
  expect(sportClip(ex.id), ex.id).toMatch(/\.mp4/)
  expect(sportAnimation(ex.id), ex.id).toMatch(/anim\.webp/)
  expect(imgSrc(EXIDX[ex.id])).toBe(sportStill(ex.id))
  expect(gifSrc(EXIDX[ex.id])).toBe(sportClip(ex.id))
}

describe('sports', () => {
  it('are in the catalogue with an id of their own and a name', () => {
    expect(SPORTS.length).toBeGreaterThanOrEqual(10)
    const names = SPORTS.map(s => s.n)
    for (const n of ['football (soccer)', 'basketball', 'swimming']) expect(names).toContain(n)
    expect(new Set(SPORTS.map(s => s.id)).size).toBe(SPORTS.length)
    for (const s of SPORTS) { expect(EXIDX[s.id]).toBe(s); expect(CATALOGUE).toContain(s); expect(isSport(s)).toBe(true) }
    expect(categoriesOf(SPORTS)).toEqual(['sport'])
  })

  it('each one says what it trains, with muscles that exist and qualities that are known', () => {
    for (const s of SPORTS) {
      expect(s.trains.length, s.id).toBeGreaterThan(0)
      for (const q of s.trains) expect(QUALITIES, `${s.id} ${q}`).toContain(q)
      const w = s.muscleWeights
      expect(Object.keys(w).length, s.id).toBeGreaterThanOrEqual(4)
      for (const [slug, v] of Object.entries(w)) { expect(MUSCLES, `${s.id} ${slug}`).toContain(slug); expect(v).toBeGreaterThan(0); expect(v).toBeLessThanOrEqual(1) }
      expect(Object.keys(musclesOf(s)).sort()).toEqual(Object.keys(w).sort())
    }
  })

  it('the muscles are the ones the sport is known for', () => {
    const m = id => musclesOf(EXIDX[id])
    expect(m('sport-football').quadriceps).toBeGreaterThan(m('sport-football').deltoids || 0)
    expect(m('sport-swimming')['upper-back']).toBeGreaterThan(m('sport-swimming').quadriceps)
    expect(m('sport-climbing').forearm).toBe(1)
    expect(m('sport-skiing').quadriceps).toBe(1)
  })

  it('are logged in minutes only, with no speed', () => {
    for (const s of SPORTS) {
      expect(isCardio(s)).toBe(true)
      expect(modeOf({ id: s.id })).toBe('cardio')
      const cfg = defaultConfig(s.id)
      expect(cfg.min).toBe(s.min)
      expect(cfg.speed).toBe(0)
    }
    expect(setLabel('sport-football', { min: 90, speed: 0 }, undefined, 'kmh')).toBe('90 min')
    expect(exLine({ id: 'sport-swimming', sets: 1, min: 30, speed: 0 }, 'kg', 'kmh')).toBe('1 × 30 min')
    // Running keeps its speed.
    expect(setLabel('0685', { min: 20, speed: 8 }, undefined, 'kmh')).toContain('km/h')
  })

  it('count on the muscle map by the minutes played', () => {
    expect(SPORT_MINUTES_PER_SET).toBe(10)
    expect(setsEquivalent(90)).toBe(9)
    const played = min => ({ entries: [{ id: 'sport-football', sets: [{ min, speed: 0, done: true }] }] })
    const half = loadOfWorkouts([played(45)]).quadriceps
    const full = loadOfWorkouts([played(90)]).quadriceps
    expect(full).toBeCloseTo(half * 2, 6)
    expect(full).toBeCloseTo(0.9 * 9, 6)
    // A set not done counts for nothing.
    expect(loadOfWorkouts([{ entries: [{ id: 'sport-football', sets: [{ min: 90, done: false }] }] }]).quadriceps || 0).toBe(0)
    // A routine plans the same way: one 60 minute block is six sets.
    expect(loadOfRoutine({ ex: [{ id: 'sport-football', sets: 1, min: 60 }] }).quadriceps).toBeCloseTo(0.9 * 6, 6)
  })

  it('have their own tile in the exercise guide and also list under their muscles', () => {
    expect(GROUPS.map(g => g.id)).toContain('sports')
    // The sports and their drills.
    expect(countsFor(CATALOGUE, MUSCLES).sports).toBe(SPORTS.length + DRILLS.length)
    const tile = exercisesFor(CATALOGUE, { kind: 'group', id: 'sports' })
    expect(tile.map(e => e.id).sort()).toEqual([...SPORTS, ...DRILLS].map(s => s.id).sort())
    // Plain cardio no longer lists them.
    expect(exercisesFor(CATALOGUE, { kind: 'group', id: 'cardio' }).some(isSport)).toBe(false)
    const forearm = exercisesFor(CATALOGUE, { kind: 'muscle', id: 'forearm' })
    expect(forearm.some(e => e.id === 'sport-climbing')).toBe(true)
  })

  it('show their name in English', () => {
    expect(exerciseNameFor(EXIDX['sport-basketball'])).toBe('basketball')
  })
  it('each has a drawing: the catalogue exercise of its movement, or a still, a loop and an animated loop of its own', () => {
    for (const s of SPORTS) expectDrawing(s)
  })
})

describe('sport drills', () => {
  it('every sport has two, each in the catalogue, tied to its sport and logged in minutes', () => {
    for (const s of SPORTS) {
      const list = drillsOf(s.id)
      expect(list.length, s.id).toBe(2)
      for (const d of list) {
        expect(d.drillOf).toBe(s.id)
        expect(EXIDX[d.id]).toBe(d)
        expect(isSport(d)).toBe(true)
        expect(modeOf({ id: d.id })).toBe('cardio')
        expect(defaultConfig(d.id).min).toBe(d.min)
      }
    }
    expect(DRILLS.length).toBe(SPORTS.length * 2)
    expect(new Set([...SPORTS, ...DRILLS].map(e => e.id)).size).toBe(SPORTS.length + DRILLS.length)
    expect(new Set(DRILLS.map(d => d.n)).size).toBe(DRILLS.length)
    expect(drillsOf('0001')).toEqual([])
  })

  it('say how they are done and what they train, with muscles that exist', () => {
    for (const d of DRILLS) {
      expect(d.desc.length, d.id).toBeGreaterThan(40)
      expect(descFor(d)).toBe(d.desc)
      for (const q of d.trains) expect(QUALITIES, `${d.id} ${q}`).toContain(q)
      for (const [slug, v] of Object.entries(d.muscleWeights)) { expect(MUSCLES, `${d.id} ${slug}`).toContain(slug); expect(v).toBeGreaterThan(0); expect(v).toBeLessThanOrEqual(1) }
      expect(d.primaries.length, d.id).toBeGreaterThan(0)
    }
    // The ones that are about one thing load it most.
    expect(musclesOf(EXIDX['drill-climbing-hangboard']).forearm).toBe(1)
    expect(musclesOf(EXIDX['drill-skiing-wall-sit']).quadriceps).toBe(1)
  })

  it('each has a drawing: the catalogue exercise of its movement, or a still, a loop and an animated loop of its own', () => {
    for (const d of DRILLS) expectDrawing(d)
  })

  it('show the catalogue drawing of the exercise they name, for the chosen figure too', () => {
    for (const [id, media] of Object.entries(CATALOGUE_DRAWING)) {
      const ex = EXIDX[id], drawn = EXIDX[media]
      expect(ex?.media, id).toBe(media)
      expect(drawn && !drawn.sport, `${id} -> ${media}`).toBe(true)
      for (const figure of ['male', 'female']) {
        expect(imgSrc(ex, figure)).toBe(imgSrc(drawn, figure))
        expect(gifSrc(ex, figure)).toBe(gifSrc(drawn, figure))
      }
    }
  })
})

describe('sport-media.js in the built app', () => {
  it('calls import.meta.glob instead of testing it with typeof, which is false once Vite has built the app', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./sport-media.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '')
    expect(src).not.toMatch(/typeof\s+import\.meta\.glob/)
    expect(src).toMatch(/import\.meta\.glob\(/)
  })
})
