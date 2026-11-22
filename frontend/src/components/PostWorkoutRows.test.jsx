// @vitest-environment happy-dom
// The pencil on your own post in the feed edits the workout itself, not only the post's words:
// its exercises and sets open in the workout editor, which comes back to the feed, and its length
// has a row of its own.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'

const mocks = vi.hoisted(() => ({ nav: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.nav }))
vi.mock('../lib/nav.js', async importOriginal => ({
  ...(await importOriginal()),
  closeThenNav: (close, to) => { close(); mocks.nav(to) },
}))
import { PostWorkoutRows } from './Social.jsx'

const legs = { id: 'w1', name: 'Legs', d: '2026-11-22', start: 1000, end: 1000 + 28 * 60000,
  entries: [{ id: '0025', sets: [{ w: 110, r: 5, done: true }, { w: 110, r: 5, done: true }] }, { id: '0032', sets: [{ w: 70, r: 10, done: true }] }] }

let host, root, base
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  mocks.nav.mockReset()
  base = useStore.getState().S
  useStore.getState().update(s => { s.workouts = [structuredClone(legs)]; s.active = null })
})
afterEach(() => { act(() => root.unmount()); host.remove(); useStore.getState().update(s => { s.workouts = base.workouts; s.active = base.active }) })

describe('editing the workout behind a post', () => {
  it('shows what the workout holds and how long it took', () => {
    act(() => root.render(<PostWorkoutRows w={legs} close={() => {}} />))
    expect(host.textContent).toContain('2 exercises')
    expect(host.textContent).toContain('3 sets')
    expect(host.textContent).toContain('28 min')
  })

  it('opens the workout editor on it, to come back to the feed', () => {
    const close = vi.fn()
    act(() => root.render(<PostWorkoutRows w={legs} close={close} />))
    const edit = [...host.querySelectorAll('button')].find(b => b.textContent.includes('Edit workout'))
    act(() => edit.click())
    expect(close).toHaveBeenCalled()
    expect(mocks.nav).toHaveBeenCalledWith('/workout')
    const A = useStore.getState().S.active
    expect(A.editingWorkoutId).toBe('w1')
    expect(A.editReturn).toBe('/home')
  })

  it('does not start a second session over one in progress', () => {
    useStore.getState().update(s => { s.active = { entries: [], start: 1 } })
    act(() => root.render(<PostWorkoutRows w={legs} close={() => {}} />))
    expect(host.textContent).toContain('Finish the current workout first.')
    const edit = [...host.querySelectorAll('button')].find(b => b.textContent.includes('Edit workout'))
    expect(edit).toBeUndefined()
  })
})
