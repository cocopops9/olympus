// @vitest-environment happy-dom
// The case reported on 2026-11-26: 760 kg typed on a dumbbell bench press whose heaviest logged set
// was 76 kg, with a stale kept weight of 10,000 kg. The set's tick shows "!", and tapping it asks
// before logging; the Best chip reads the logged history, not the kept weight.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Workout from './Workout.jsx'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

vi.mock('../lib/sound.js', () => ({ beep: vi.fn(), chime: vi.fn(), vibrate: vi.fn(), alertBuzz: vi.fn(), unlock: vi.fn(), triumph: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})), appBase: () => '/' }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const DB_BENCH = '0289'
let root, container

function render(w) {
  const S = JSON.parse(JSON.stringify(DEF))
  S.workouts = [{ id: 'w1', d: '2026-05-16', start: Date.parse('2026-05-16T10:00:00'), end: Date.parse('2026-05-16T11:00:00'),
    entries: [{ id: DB_BENCH, target: { sets: 1, reps: 12, weight: 76 }, sets: [{ w: 76, r: 12, done: true }] }] }]
  S.exWeights = { [DB_BENCH]: { w: 10000, d: '2026-11-20' } }
  S.active = { id: 't', d: '2026-11-26', start: Date.now(), routineIds: [], name: 'Freestyle', bw: null, cur: 0,
    entries: [{ id: DB_BENCH, target: { sets: 1, reps: 12, weight: w }, sets: [{ w, r: 12, done: false }] }] }
  useStore.setState({ S, user: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<MemoryRouter><Workout /></MemoryRouter>))
}

beforeEach(() => { localStorage.clear(); useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null }) })
afterEach(() => { act(() => root?.unmount()); container?.remove() })

describe('a likely typo on the workout card', () => {
  const tick = () => container.querySelector('button[role="checkbox"]')
  const sheet = () => useUI.getState().sheets.at(-1)
  function renderSheet(which = sheet()) {
    const box = document.createElement('div')
    document.body.appendChild(box)
    const r = createRoot(box)
    act(() => r.render(which.render(() => useUI.getState().closeSheet(which.id))))
    return { box, r }
  }

  it('760 kg after a best of 76 x 12: "!" instead of the tick, and Best is the logged 76 kg', () => {
    render(760)
    expect(tick().classList.contains('warn')).toBe(true)
    expect(tick().textContent).toBe('!')
    const tags = [...container.querySelectorAll('.tag')].map(x => x.textContent)
    expect(tags.some(x => x.includes('Best:') && x.includes('76'))).toBe(true)
    expect(tags.some(x => x.includes('10,000') || x.includes('10000'))).toBe(false)
  })

  it('tapping "!" asks; "No, correct it" leaves the set unticked, "Yes" logs it and asks no more', () => {
    render(760)
    act(() => tick().click())
    expect(useStore.getState().S.active.entries[0].sets[0].done).toBe(false)
    let { box, r } = renderSheet()
    expect(box.textContent).toContain('760 kg is far above your best (estimated 1RM 106.4 kg)')
    act(() => [...box.querySelectorAll('button')].find(b => b.textContent === 'No, correct it').click())
    act(() => r.unmount()); box.remove()
    expect(useStore.getState().S.active.entries[0].sets[0].done).toBe(false)

    act(() => tick().click())
    ;({ box, r } = renderSheet())
    act(() => [...box.querySelectorAll('button')].find(b => b.textContent.startsWith('Yes, log')).click())
    act(() => r.unmount()); box.remove()
    const row = useStore.getState().S.active.entries[0].sets[0]
    expect(row.done).toBe(true)
    expect(row.loadOk).toBe(760)
    // Unticked and ticked again at the same weight: no question this time.
    useUI.setState({ sheets: [] })
    act(() => tick().click())
    act(() => tick().click())
    expect(useStore.getState().S.active.entries[0].sets[0].done).toBe(true)
    // Ticking the last set may bring up the workout's own sheets, never the question again.
    for (const sh of useUI.getState().sheets) {
      const b = renderSheet.call(null, sh)
      expect(b.box.textContent).not.toContain('Is 760 kg right?')
      act(() => b.r.unmount()); b.box.remove()
    }
  })

  it('an ordinary weight shows the plain tick and ticks at once', () => {
    render(78)
    expect(tick().classList.contains('warn')).toBe(false)
    act(() => tick().click())
    expect(useStore.getState().S.active.entries[0].sets[0].done).toBe(true)
  })
})
