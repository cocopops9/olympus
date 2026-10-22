// @vitest-environment happy-dom
// A Dark / Light button sits beside the gear on Home, so the theme can be flipped without going
// through Settings, Look. It stores an explicit choice, also when it starts from System.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import Home from './Home.jsx'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), startFlow: vi.fn(), bwDeltaColor: () => '', weighInsSheet: vi.fn(),
}))

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = () => ({ matches: false })   // the OS asks for a light page
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const setTheme = theme => useStore.setState(s => ({ S: { ...s.S, theme }, user: null }))
const mount = () => act(() => root.render(<Home />))
const button = () => host.querySelector('.hdr-actions button[aria-label^="Theme"]')
const click = () => act(() => { button().dispatchEvent(new MouseEvent('click', { bubbles: true })) })

describe('Home, theme button', () => {
  it('offers Light on the dark theme, and stores it', () => {
    setTheme('dark'); mount()
    expect(button().getAttribute('aria-label')).toBe('Theme: Light')
    click()
    expect(useStore.getState().S.theme).toBe('light')
  })

  it('offers Dark on the light theme, and stores it', () => {
    setTheme('light'); mount()
    expect(button().getAttribute('aria-label')).toBe('Theme: Dark')
    click()
    expect(useStore.getState().S.theme).toBe('dark')
  })

  it('flips what System shows, and stores a fixed choice', () => {
    setTheme('system'); mount()
    expect(button().getAttribute('aria-label')).toBe('Theme: Dark')
    click()
    expect(useStore.getState().S.theme).toBe('dark')
  })

  it('sits next to the Settings button', () => {
    setTheme('dark'); mount()
    expect(host.querySelectorAll('.hdr-actions button').length).toBe(2)
  })
})
