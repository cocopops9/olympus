import { describe, expect, it } from 'vitest'
import { rankForPicker } from './picker-rank.js'
import { POPULAR } from './exercise-guide.js'

const popular = [...POPULAR].slice(0, 6)
const ex = (id, n, extra = {}) => ({ id, n, ...extra })
const ids = list => list.map(e => e.id)

describe('rankForPicker without a search', () => {
  const list = [ex('r1', 'Zottman Curl'), ex(popular[0], 'Bench Press'), ex('u1', 'Cable Fly'), ex(popular[1], 'Squat'), ex('u2', 'Dip'), ex('r2', 'Arm Circle')]
  const usage = { u1: 3, u2: 9 }

  it('lists what you do most first, then the popular ones, then the rest, each in its own order', () => {
    expect(ids(rankForPicker(list, {}, usage))).toEqual(['u2', 'u1', popular[0], popular[1], 'r1', 'r2'])
  })

  it('puts a favourite you have not used after the used ones, then one you made', () => {
    const l = [ex('r1', 'A'), ex('mine', 'B', { custom: true }), ex('fav', 'C'), ex('u1', 'D')]
    expect(ids(rankForPicker(l, { favEx: ['fav'] }, { u1: 1 }))).toEqual(['u1', 'fav', 'mine', 'r1'])
  })

  it('is the list as it came when nothing is yours or popular', () => {
    const l = [ex('b', 'B'), ex('a', 'A')]
    expect(ids(rankForPicker(l, {}, {}))).toEqual(['b', 'a'])
  })
})

describe('rankForPicker while typing', () => {
  const list = [
    ex('dc', 'Dumbbell Chest Press', { }),
    ex('cp', 'Chest Press'),
    ex(popular[0], 'Chest Fly'),
    ex('cr', 'Chest Dip'),
    ex('cu', 'Cheek Stretch'),
    ex('x', 'Incline Chest Press'),
    ex('typo', 'Cheat Curl'),
  ]
  const usage = { cr: 5, cu: 2, dc: 7 }

  it('puts names that start with the letters first, yours by use, then popular, then the rest', () => {
    const out = ids(rankForPicker(list, {}, usage, { query: 'che' }))
    expect(out.slice(0, 5)).toEqual(['cr', 'cu', popular[0], 'cp', 'typo'])
  })

  it('then names with a later word that starts with them, in the same three tiers', () => {
    const out = ids(rankForPicker(list, {}, usage, { query: 'che' }))
    expect(out.slice(5)).toEqual(['dc', 'x'])
  })

  it('follows a longer start and ignores accents and case', () => {
    const l = [ex('a', 'Press Chest'), ex('b', 'Chest Press'), ex('c', 'Développé Couché')]
    expect(ids(rankForPicker(l, {}, {}, { query: 'CHEST pr' }))).toEqual(['b', 'a', 'c'])
    expect(ids(rankForPicker(l, {}, {}, { query: 'developpe' }))[0]).toBe('c')
  })

  it('leaves a match the typed words only reach through the search at the end', () => {
    const l = [ex('far', 'Pec Deck'), ex('near', 'Chest Press')]
    expect(ids(rankForPicker(l, {}, { far: 9 }, { query: 'chest' }))).toEqual(['near', 'far'])
  })

  it('uses the name on screen', () => {
    const l = [ex('a', 'Bench Press', { it: 'Panca piana' }), ex('b', 'Pec Fly', { it: 'Croci' })]
    expect(ids(rankForPicker(l, {}, {}, { query: 'cro', nameOf: e => e.it }))).toEqual(['b', 'a'])
  })
})
