// The body-first picker's choices: what each tap lists and in which order (lib/exercise-guide.js).
import { describe, expect, it } from 'vitest'
import { CATALOGUE } from './exercises.js'
import { MUSCLES, musclesOf } from './muscles.js'
import { GROUPS, POPULAR, STAPLES, arrange, countsFor, exercisesFor, isStretch, isCardioEx } from './exercise-guide.js'

const byName = n => CATALOGUE.find(e => e.n === n)

describe('exercise guide', () => {
  it('resolves every staple name to a catalogue exercise', () => {
    for (const [key, ids] of Object.entries(STAPLES)) {
      expect(ids.length, key).toBeGreaterThanOrEqual(3)
      for (const id of ids) expect(CATALOGUE.some(e => e.id === id), `${key} ${id}`).toBe(true)
    }
  })

  it('a muscle lists what mainly trains it, without its stretches or cardio', () => {
    const chest = exercisesFor(CATALOGUE, { kind: 'muscle', id: 'chest' })
    expect(chest.length).toBeGreaterThan(100)
    expect(chest.every(e => musclesOf(e).chest === 1 && !isStretch(e) && !isCardioEx(e))).toBe(true)
  })

  it('muscles that are rarely the main target still list something', () => {
    const counts = countsFor(CATALOGUE, MUSCLES)
    for (const m of ['obliques', 'hip-flexors', 'tibialis']) {
      expect(counts[m], m).toBeGreaterThan(0)
      expect(exercisesFor(CATALOGUE, { kind: 'muscle', id: m }).length, m).toBe(counts[m])
    }
  })

  it('the staples lead, the well-known follow, the rest waits behind "more"', () => {
    const { yours, popular, more } = arrange(exercisesFor(CATALOGUE, { kind: 'muscle', id: 'chest' }), { staples: STAPLES.chest })
    expect(yours).toEqual([])
    expect(popular.slice(0, 3).map(e => e.n)).toEqual(['barbell bench press', 'dumbbell bench press', 'push-up'])
    expect(popular.length).toBeLessThan(60)
    expect(more.every(e => !POPULAR.has(e.id))).toBe(true)
    expect(new Set([...popular, ...more].map(e => e.id)).size).toBe(popular.length + more.length)
  })

  it('your own exercises come first, starred before most used', () => {
    const list = exercisesFor(CATALOGUE, { kind: 'muscle', id: 'chest' })
    const fly = byName('dumbbell fly'), press = byName('lever chest press')
    const { yours, popular } = arrange(list, { usage: { [press.id]: 9 }, favs: new Set([fly.id]), staples: STAPLES.chest })
    expect(yours.map(e => e.id)).toEqual([fly.id, press.id])
    expect(popular.some(e => e.id === fly.id || e.id === press.id)).toBe(false)
  })

  it('the tiles split the non-muscle training apart', () => {
    const counts = countsFor(CATALOGUE, MUSCLES)
    for (const g of GROUPS) expect(counts[g.id], g.id).toBeGreaterThan(20)
    const cardio = exercisesFor(CATALOGUE, { kind: 'group', id: 'cardio' })
    expect(cardio.some(e => e.n === 'run')).toBe(true)
    expect(exercisesFor(CATALOGUE, { kind: 'group', id: 'stretch' }).every(isStretch)).toBe(true)
    expect(exercisesFor(CATALOGUE, { kind: 'mine' }, new Set([cardio[0].id])).map(e => e.id)).toEqual([cardio[0].id])
  })
})
