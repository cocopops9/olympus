// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Activity from './Activity.jsx'

let root, host
globalThis.IS_REACT_ACT_ENVIRONMENT = true
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-25T10:00:00')) })
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; vi.useRealTimers() })

const at = (iso, min) => { const start = +new Date(iso + 'T09:00:00'); return { d: iso, start, end: start + min * 60000, vol: 0 } }
const S = { unit: 'kg', weekStart: 1, workouts: [at('2026-11-02', 60), at('2026-11-20', 30), at('2026-10-05', 45), at('2025-06-10', 90)] }

const mount = () => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); act(() => root.render(<Activity S={S} />)) }
const daysTrained = () => host.querySelector('.hm-sum b').textContent
const title = () => host.querySelector('.am-t b').textContent
const click = label => act(() => host.querySelector(`[aria-label="${label}"]`).click())
const tab = name => act(() => [...host.querySelectorAll('button')].find(b => b.textContent === name).click())
const swipe = dx => {
  const el = host.querySelector('.act')
  act(() => { el.dispatchEvent(Object.assign(new Event('touchstart', { bubbles: true }), { touches: [{ clientX: 200, clientY: 300 }] })) })
  act(() => { el.dispatchEvent(Object.assign(new Event('touchend', { bubbles: true }), { changedTouches: [{ clientX: 200 + dx, clientY: 305 }] })) })
}

it('pages the month back and forward, the numbers on top following the month shown', () => {
  mount()
  expect(title()).toBe('November 2026')
  expect(daysTrained()).toBe('2')
  expect(host.querySelector('[aria-label="Next month"]').disabled).toBe(true)
  click('Previous month')
  expect(title()).toBe('October 2026')
  expect(daysTrained()).toBe('1')
  click('Next month')
  expect(title()).toBe('November 2026')
})

it('pages years, and a swipe does what the arrows do', () => {
  mount()
  tab('Year')
  expect(title()).toBe('2026')
  expect(daysTrained()).toBe('3')
  swipe(120)
  expect(title()).toBe('2025')
  expect(daysTrained()).toBe('1')
  expect(host.querySelector('.hm-c.out')).toBeTruthy()
  swipe(-120)
  expect(title()).toBe('2026')
  swipe(-120)
  expect(title()).toBe('2026')
})

it('keeps a place per view, and pages the weeks twelve at a time', () => {
  mount()
  click('Previous month')
  tab('Weeks')
  expect(daysTrained()).toBe('3')
  expect(host.querySelectorAll('.aw-b')).toHaveLength(12)
  expect(host.querySelector('.aw-b.now')).toBeTruthy()
  click('Earlier weeks')
  expect(host.querySelector('.aw-b.now')).toBeNull()
  expect(daysTrained()).toBe('0')
  tab('Month')
  expect(title()).toBe('October 2026')
})
