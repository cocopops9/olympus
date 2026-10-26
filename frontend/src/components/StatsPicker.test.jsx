// @vitest-environment happy-dom
// The statistics picker (components/StatsPicker.jsx): the cards on the page with arrows and a
// switch, the rest as tiles to add; every change goes straight into S.statsCards.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ S: null, sheet: null }))
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector({ S: mocks.S })
  useStore.getState = () => ({ S: mocks.S, update: fn => { const s = structuredClone(mocks.S); fn(s); mocks.S = s; mocks.rerender?.() } })
  return { useStore }
})
vi.mock('../store/useUI.js', () => ({ useUI: { getState: () => ({ openSheet: render => { mocks.sheet = render } }) } }))
import { statsPickerSheet } from './StatsPicker.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, host
afterEach(() => { act(() => root.unmount()); host.remove(); mocks.rerender = null })
function open(S) {
  mocks.S = S
  statsPickerSheet()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  mocks.rerender = () => root.render(mocks.sheet(() => {}))
  act(() => mocks.rerender())
}
const shown = () => [...host.querySelectorAll('.sp-row .sp-name')].map(n => n.textContent)
const click = label => act(() => host.querySelector(`[aria-label="${label}"]`).click())

describe('stats picker', () => {
  it('moves, hides and adds cards, saving the order', () => {
    open({ statsCards: ['summary', 'activity', 'recent'] })
    expect(shown()).toEqual(['Summary', 'Activity', 'Recent workouts'])
    click('Move Recent workouts up')
    expect(mocks.S.statsCards).toEqual(['summary', 'recent', 'activity'])
    click('Hide Summary')
    expect(mocks.S.statsCards).toEqual(['recent', 'activity'])
    click('Show Effort')
    expect(mocks.S.statsCards).toEqual(['recent', 'activity', 'effort'])
    expect(shown()).toEqual(['Recent workouts', 'Activity', 'Effort'])
  })
  it('Default goes back to the starting set', () => {
    open({ statsCards: ['recent'] })
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'Default').click())
    expect(mocks.S.statsCards).toBe(null)
    expect(shown()).toContain('Exercise progress')
  })
})
