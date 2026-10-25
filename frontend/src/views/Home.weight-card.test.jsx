// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import Home from './Home.jsx'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), startFlow: vi.fn(), bwDeltaColor: () => '',
}))

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const mountWith = showWeightCard => {
  useStore.setState(s => ({
    S: { ...s.S, routines: [], workouts: [], bodyweight: [], dayPlan: {}, week: {}, active: null, showWeightCard },
    user: null,
  }))
  act(() => root.render(<Home />))
}
const weightHeading = () => [...host.querySelectorAll('h2')].find(el => el.textContent === 'Body weight')

describe('Home has no body-weight card', () => {
  // Olympus: body weight lives on its own page (Profile, Body tracking), never on the front
  // screens, whatever an older profile saved for the old Home card switch.
  it('shows no card, whatever the old preference says', () => {
    for (const v of [undefined, true, false]) {
      mountWith(v)
      expect(weightHeading()).toBeFalsy()
    }
  })
})
