// @vitest-environment happy-dom
// The workout calendar themes each month after the Attic month that starts in it
// (lib/greek-months.js) and turns the month on a sideways swipe as well as on its arrows.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { calendarSheet } from './sheets.jsx'
import { ATTIC_MONTHS } from './lib/greek-months.js'

const mounted = []
function mountTopSheet() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}
const title = host => host.querySelector('h3').textContent
const attic = host => host.querySelector('.gm-name').textContent
function swipe(host, dx) {
  const el = host.querySelector('.gm-page')
  act(() => { el.dispatchEvent(Object.assign(new Event('touchstart', { bubbles: true }), { touches: [{ clientX: 200, clientY: 300 }] })) })
  act(() => { el.dispatchEvent(Object.assign(new Event('touchend', { bubbles: true }), { changedTouches: [{ clientX: 200 + dx, clientY: 305 }] })) })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-16T12:00:00'))
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  document.body.innerHTML = ''
  useUI.setState({ sheets: [], toasts: [] })
  useStore.setState({ S: { ...JSON.parse(JSON.stringify(DEF)), workouts: [], dayPlan: {} }, user: null })
})
afterEach(() => {
  act(() => { mounted.splice(0).forEach(root => root.unmount()) })
  vi.useRealTimers()
})

describe('workout calendar months', () => {
  it('shows the Attic month that starts in the shown month', () => {
    calendarSheet()
    const host = mountTopSheet()
    expect(title(host)).toBe('November 2026')
    expect(attic(host)).toBe('Maimakterion')
    expect(host.querySelector('.gm-theme').textContent).toBe('Zeus of the storms')
    expect(host.querySelector('img.gm-scene')).not.toBeNull()
  })

  it('names every scene picture after a month\'s emblem', () => {
    const files = Object.keys(import.meta.glob('./assets/greek-months/*.webp'))
    const arts = new Set(ATTIC_MONTHS.map(m => m.art))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) expect(arts.has(f.split('/').pop().replace('.webp', '')), f).toBe(true)
  })

  it('a swipe toward the start of the line opens the next month, toward the end the previous', () => {
    calendarSheet()
    const host = mountTopSheet()
    swipe(host, -120)
    expect(title(host)).toBe('December 2026')
    expect(attic(host)).toBe('Poseideon')
    swipe(host, 120)
    swipe(host, 120)
    expect(title(host)).toBe('October 2026')
    expect(attic(host)).toBe('Pyanepsion')
  })

  it('a mostly vertical drag or a short one leaves the month alone', () => {
    calendarSheet()
    const host = mountTopSheet()
    const el = host.querySelector('.gm-page')
    act(() => { el.dispatchEvent(Object.assign(new Event('touchstart', { bubbles: true }), { touches: [{ clientX: 200, clientY: 300 }] })) })
    act(() => { el.dispatchEvent(Object.assign(new Event('touchend', { bubbles: true }), { changedTouches: [{ clientX: 140, clientY: 420 }] })) })
    swipe(host, -30)
    expect(title(host)).toBe('November 2026')
  })
})
