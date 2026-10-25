// @vitest-environment happy-dom
// The Workout tab with nothing running (views/WorkoutStart.jsx): start empty, today's routine
// first and marked, every routine a card with a Start, and Explore adding a ready-made routine.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO } from '../lib/format.js'
import WorkoutStart from './WorkoutStart.jsx'

const mounted = []
function render(node) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(node))
  return host
}
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text))

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  const S = structuredClone(DEF)
  S.weighIn = false
  S.routines = [
    { id: 'r1', name: 'Legs', emoji: 'legs', ex: [{ id: '0043', sets: 3, reps: 8 }] },
    { id: 'r2', name: 'Push', emoji: 'barbell', ex: [{ id: '0025', sets: 4, reps: 8 }, { id: '0047', sets: 3, reps: 10 }] },
  ]
  const day = new Date(todayISO() + 'T12:00:00').getDay()
  S.week = { ...S.week, [day]: ['r2'] }
  useStore.setState({ S, user: null })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(r => r.unmount()) }) })

describe('workout start screen', () => {
  it('puts today’s routine first, marked Today, each routine a card with what it trains', () => {
    const host = render(<MemoryRouter><WorkoutStart /></MemoryRouter>)
    const cards = [...host.querySelectorAll('.rt-card')]
    expect(cards.map(c => c.querySelector('.rt-name').textContent)).toEqual(['Push', 'Legs'])
    expect(cards[0].classList.contains('today')).toBe(true)
    expect(cards[0].querySelector('.rt-today').textContent).toBe('Today')
    expect(cards[0].querySelector('.rt-meta').textContent).toBe('2 exercises · 7 sets')
    expect(cards[0].querySelector('.rt-chip').textContent).toBe('Chest')
  })

  it('starts an empty workout, and a routine from its card', () => {
    const host = render(<MemoryRouter><WorkoutStart /></MemoryRouter>)
    act(() => button(host.querySelectorAll('.rt-card')[1], 'Start routine').click())
    expect(useStore.getState().S.active?.entries.map(e => e.id)).toEqual(['0043'])
    useStore.setState(s => ({ S: { ...s.S, active: null } }))
    act(() => host.querySelector('.ws-empty').click())
    expect(useStore.getState().S.active?.entries).toEqual([])
  })

  it('Explore adds a ready-made routine to yours', () => {
    const host = render(<MemoryRouter><WorkoutStart /></MemoryRouter>)
    act(() => button(host, 'Explore routines').click())
    const sheet = useUI.getState().sheets.at(-1)
    const sh = render(<MemoryRouter>{sheet.render(() => {})}</MemoryRouter>)
    act(() => button(sh, 'Add routine').click())
    const names = useStore.getState().S.routines.map(r => r.name)
    expect(names).toEqual(['Legs', 'Push', 'Push Day'])
    expect(useUI.getState().toastMsg).toBe('“Push Day” added to your routines')
  })
})
