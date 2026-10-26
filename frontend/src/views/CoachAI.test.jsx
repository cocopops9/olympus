// @vitest-environment happy-dom
// The AI coaches full screen (views/CoachAI.jsx): the coach is picked like a model, the
// conversations of both are in the drawer, and the floating button can be switched back on.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({ coaches: [] }))
vi.mock('../lib/hercules.js', async orig => ({
  ...(await orig()),
  herculesStatus: vi.fn(async () => ({ on: true, perDay: 20, left: 20 })),
  askHercules: vi.fn(async (list, coach) => { mocks.coaches.push(coach); return { reply: 'Answer from ' + coach, left: 19, perDay: 20 } }),
}))
import { useStore, DEF } from '../store/useStore.js'
import CoachAI from './CoachAI.jsx'
import { fabHidden, setFabHidden, resetGreetingForTests } from '../components/Hercules.jsx'

let root, host
const flush = () => act(() => new Promise(r => setTimeout(r, 0)))
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear(); resetGreetingForTests(); mocks.coaches = []
  useStore.setState({ S: structuredClone(DEF), user: { id: 'u1', name: 'Giuseppe Rossi' }, ready: true })
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const type = text => {
  const box = host.querySelector('.cai-box textarea')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  act(() => { setter.call(box, text); box.dispatchEvent(new Event('input', { bubbles: true })) })
  act(() => host.querySelector('.cai-box .hc-send').click())
}

describe('AI coach, full screen', () => {
  it('greets by name, sends to the coach picked like a model, and lists both coaches in the drawer', async () => {
    act(() => root.render(<MemoryRouter initialEntries={['/ai']}><CoachAI /></MemoryRouter>))
    await flush()
    expect(host.textContent).toMatch(/Giuseppe/)
    expect(host.querySelector('.cai-pick').textContent).toContain('Hercules')
    type('Squat tips'); await flush(); await flush()
    expect(host.textContent).toContain('Answer from hercules')
    act(() => host.querySelector('.cai-pick').click())
    act(() => [...host.querySelectorAll('.cai-model')].find(b => b.textContent.includes('Athena')).click())
    await flush()
    expect(host.querySelector('.cai-pick').textContent).toContain('Athena')
    type('Deload plan'); await flush(); await flush()
    expect(mocks.coaches).toEqual(['hercules', 'athena'])
    const titles = [...host.querySelectorAll('.cai-dt')].map(e => e.textContent)
    expect(titles).toEqual(['Squat tips', 'Deload plan'])
    // the Hercules conversation opens again, under Hercules
    act(() => host.querySelectorAll('.cai-dopen')[0].click())
    await flush()
    expect(host.querySelector('.cai-pick').textContent).toContain('Hercules')
    expect(host.querySelector('.cai-me').textContent).toBe('Squat tips')
  })

  it('brings the floating coach back', async () => {
    setFabHidden(true)
    act(() => root.render(<MemoryRouter initialEntries={['/ai?c=athena']}><CoachAI /></MemoryRouter>))
    await flush()
    expect(host.querySelector('.cai-pick').textContent).toContain('Athena')
    act(() => host.querySelector('.cai-dfoot button, .cai-dfoot input').click())
    expect(fabHidden()).toBe(false)
  })
})
