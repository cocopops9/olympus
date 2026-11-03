// @vitest-environment happy-dom
// Olympus: the medals screen. The catalogue of every medal of the app is for administrators: the
// control is on the screen for them and for nobody else. The goals the person gave their coaches
// show as medals of their own, or as a way to set them when there are none.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { addNote } from '../lib/coach-memory.js'
import MedalsView from './Medals.jsx'

const roots = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(<MemoryRouter>{el}</MemoryRouter>))
  return host
}
const person = over => ({ ...structuredClone(DEF), unit: 'kg', body: 'male', birth: '1996-03-01', bodyweight: [{ d: '2026-01-01', w: 80 }], ...over })
const adminButton = host => host.querySelector('.mdl-admin-b')
const cells = host => host.querySelectorAll('.mdl-cell').length

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({}), text: async () => '{}' })))
  localStorage.clear()
  useUI.setState({ sheets: [] })
  document.body.innerHTML = ''
})
afterEach(() => { vi.unstubAllGlobals(); act(() => { roots.splice(0).forEach(r => r.unmount()) }) })

describe('the catalogue of all medals', () => {
  it('is not offered to somebody who is not an administrator, whatever the profile is called', () => {
    for (const user of [{ id: 'u1', name: 'Chaos' }, { id: 'u2', name: 'Ada', admin: false }, { id: 'u3', name: 'Ada', admin: 'yes' }, null]) {
      useStore.setState({ S: person(), user, ready: true })
      const host = mount(<MedalsView />)
      expect(adminButton(host), JSON.stringify(user)).toBeNull()
      expect(host.textContent).not.toMatch(/Administrator view/)
      act(() => roots.pop().unmount())
    }
  })

  it('lists every medal of the app for an administrator, and goes back to their own', () => {
    useStore.setState({ S: person(), user: { id: 'u9', name: 'Chaos', admin: true }, ready: true })
    const host = mount(<MedalsView />)
    const own = cells(host)
    const btn = adminButton(host)
    expect(btn).not.toBeNull()
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    act(() => btn.click())
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(host.textContent).toMatch(/Administrator view/)
    expect(cells(host)).toBeGreaterThan(own * 2)
    act(() => btn.click())
    expect(cells(host)).toBe(own)
    expect(host.textContent).not.toMatch(/Administrator view/)
  })

  it('stops showing it when the account stops being an administrator', () => {
    useStore.setState({ S: person(), user: { id: 'u9', name: 'Chaos', admin: true }, ready: true })
    const host = mount(<MedalsView />)
    const own = cells(host)
    act(() => adminButton(host).click())
    act(() => useStore.setState({ user: { id: 'u9', name: 'Chaos', admin: false } }))
    expect(adminButton(host)).toBeNull()
    expect(cells(host)).toBe(own)
  })
})

describe('your goals', () => {
  it('asks to set them while there is nothing to follow', () => {
    useStore.setState({ S: person(), user: { id: 'u1', name: 'Ada' }, ready: true })
    const host = mount(<MedalsView />)
    expect(host.querySelector('.mdl-sec-goals')?.textContent).toMatch(/Set your goals/)
    act(() => [...host.querySelectorAll('.mdl-sec-goals button')].find(b => /Set your goals/.test(b.textContent)).click())
    expect(useUI.getState().sheets).toHaveLength(1)
  })

  it('shows medals for a target in the goals, and for one only the coaches noted', () => {
    useStore.setState({ S: person({ coachProfile: { styles: ['powerlifting'], phase: null, goals: 'Squat 140 kg' } }), user: { id: 'u1', name: 'Ada' }, ready: true })
    addNote('u1', 'Wants a 100 kg bench press')
    const host = mount(<MedalsView />)
    const sec = host.querySelector('.mdl-sec-goals')
    expect(sec.textContent).toMatch(/Edit goals/)
    expect(sec.textContent).toMatch(/Squat: 140 kg/i)
    expect(sec.textContent).toMatch(/Bench press: 100 kg/i)
  })
})
