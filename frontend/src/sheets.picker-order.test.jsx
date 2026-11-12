// @vitest-environment happy-dom
// The swap/add picker lists what you do most first, then the popular exercises, then the rest; a
// typed start ("che") brings the names that start with it first, in the same three tiers.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { EXDB } from './lib/exercises.js'
import { POPULAR } from './lib/exercise-guide.js'
import { exercisePicker } from './sheets.jsx'

const mounted = []
function renderTop() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}
const names = host => [...host.querySelectorAll('.list .item:not(.ex-new) .tt')].map(x => x.textContent)

const starting = EXDB.filter(e => e.n.toLowerCase().startsWith('che'))
const popularOnes = starting.filter(e => POPULAR.has(e.id))
const plainOnes = starting.filter(e => !POPULAR.has(e.id))
const yours = plainOnes[0], yoursMore = plainOnes[1]

const workout = entries => ({ id: 'w' + Math.random(), d: '2026-10-01', start: 1, end: 2, name: 'x', entries: entries.map(id => ({ id, sets: [{ w: 20, r: 10, done: true }] })) })

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  const S = structuredClone(DEF)
  // yoursMore three times, yours once: both unpopular, both on top
  S.workouts = [workout([yoursMore.id, yours.id]), workout([yoursMore.id]), workout([yoursMore.id])]
  useStore.setState({ S, user: null })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('picker order while typing', () => {
  it('the catalogue has what the test needs', () => {
    expect(popularOnes.length).toBeGreaterThan(0)
    expect(plainOnes.length).toBeGreaterThan(3)
  })

  it('names starting with the letters: yours by use, then popular, then the rest', () => {
    exercisePicker(() => {}, { query: 'che' })
    const listed = names(renderTop())
    const nameStarts = listed.filter(n => n.toLowerCase().startsWith('che'))
    const idsOf = new Map(EXDB.map(e => [e.n, e.id]))
    expect(nameStarts.slice(0, 2)).toEqual([yoursMore.n, yours.n])
    const rest = nameStarts.slice(2).map(n => idsOf.get(n))
    const firstPlain = rest.findIndex(id => !POPULAR.has(id))
    expect(firstPlain).toBeGreaterThan(0)
    expect(rest.slice(firstPlain).some(id => POPULAR.has(id))).toBe(false)
    // and every name that merely contains the letters comes after all of those
    const lastStart = listed.map(n => n.toLowerCase().startsWith('che')).lastIndexOf(true)
    const firstContains = listed.findIndex(n => !n.toLowerCase().startsWith('che'))
    expect(firstContains === -1 || firstContains > lastStart).toBe(true)
  })
})

describe('picker order with nothing typed', () => {
  it('opens with what you do most, then the popular ones, then the rest', () => {
    exercisePicker(() => {})
    const listed = names(renderTop())
    expect(listed.slice(0, 2)).toEqual([yoursMore.n, yours.n])
    const idsOf = new Map(EXDB.map(e => [e.n, e.id]))
    const after = listed.slice(2).map(n => idsOf.get(n))
    // the list shows 50 at a time, and there are some 230 popular exercises: the first screen is all of them
    expect(after.length).toBeGreaterThan(20)
    expect(after.every(id => POPULAR.has(id))).toBe(true)
  })
})
