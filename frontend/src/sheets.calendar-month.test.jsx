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
    expect(files.length).toBe(12) // every month has its scene
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

  it('shows the week streak, and marks this month\'s rest days with a moon', () => {
    // Today is Monday 16 November. Workouts on the 10th, 12th and 16th (this week and last), and
    // on 2 November (the week before), so the streak is 3 weeks with the default Monday start.
    const w = (id, d) => ({ id, d, start: Date.parse(d + 'T18:00:00'), end: Date.parse(d + 'T19:00:00'), entries: [], vol: 0 })
    useStore.setState(s => ({ S: { ...s.S, workouts: [w('a', '2026-11-02'), w('b', '2026-11-10'), w('c', '2026-11-12'), w('d', '2026-11-16')] } }))
    calendarSheet()
    const host = mountTopSheet()
    expect(host.querySelector('.cal-stat.streak').textContent).toBe('3 week streak')
    // Rest: 3-9, 11, 13-15 (the 1st is before the first workout, the 16th is trained).
    const rest = [...host.querySelectorAll('.cal-d.rest')].map(b => b.querySelector('span').textContent)
    expect(rest).toEqual(['3', '4', '5', '6', '7', '8', '9', '11', '13', '14', '15'])
    expect(host.querySelector('.cal-stat.rest').textContent).toBe('11 rest days')
    // October was before the first workout: no rest days there.
    act(() => { host.querySelector('[aria-label="Previous month"]').click() })
    expect(host.querySelectorAll('.cal-d.rest').length).toBe(0)
    expect(host.querySelector('.cal-stat.rest').textContent).toBe('0 rest days')
  })
})
