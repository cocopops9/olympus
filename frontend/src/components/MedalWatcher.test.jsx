// @vitest-environment happy-dom
// The watcher (components/Medals.jsx useMedalWatcher): what is earned from now on is celebrated,
// what a profile already had when the watcher first saw it is marked without a show.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/sound.js', async orig => ({ ...(await orig()), medalSound: vi.fn(), triumph: vi.fn() }))

import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { MedalCelebration, useMedalWatcher } from './Medals.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const today = () => new Date().toISOString().slice(0, 10)
const workout = (id, d) => ({ id, d, start: Date.parse(d + 'T09:00:00'), end: Date.parse(d + 'T10:00:00'), entries: [] })

function Harness() {
  useMedalWatcher(true)
  return <MedalCelebration />
}

let root, host
const fresh = over => ({ ...JSON.parse(JSON.stringify(DEF)), sound: true, ...over })
const mount = () => act(() => root.render(<MemoryRouter><Harness /></MemoryRouter>))
const settle = () => act(() => { vi.advanceTimersByTime(1600) })
const banner = () => host.querySelector('.mdl-cele')

beforeEach(() => {
  vi.useFakeTimers()
  useUI.setState({ sheets: [] })
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })

describe('medal watcher', () => {
  it('celebrates the first workout of a new profile', () => {
    useStore.setState({ S: fresh() })
    mount(); settle()
    expect(banner()).toBe(null)
    act(() => useStore.getState().update(s => { s.workouts = [workout('w1', today())] }))
    settle()
    expect(banner()).not.toBe(null)
    expect(banner().textContent).toContain('First workout')
  })

  it('marks without a show what a profile already had when the watcher first saw it', () => {
    useStore.setState({ S: fresh({ workouts: [workout('w1', '2024-01-10'), workout('w2', '2024-01-12')] }) })
    mount(); settle()
    expect(banner()).toBe(null)
    expect(useStore.getState().S.medals?.got?.['count:1']).toBeTruthy()
  })
})
describe('a profile the watcher has seen before', () => {
  it('with got already set, the first workout is celebrated', () => {
    useStore.setState({ S: fresh({ medals: { got: {} } }) })
    mount(); settle()
    act(() => useStore.getState().update(s => { s.workouts = [workout('w1', today())] }))
    settle()
    expect(banner()).not.toBe(null)
  })
})
