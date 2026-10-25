// @vitest-environment happy-dom
// Hercules: the portrait shows on the main screens for a signed-in profile on a server that has
// him, the chat sends the conversation and shows the answer with the messages left today.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({ status: { on: true, perDay: 20, left: 20 }, sent: [], answer: null }))
vi.mock('../lib/hercules.js', async orig => ({
  ...(await orig()),
  herculesStatus: vi.fn(async () => mocks.status),
  askHercules: vi.fn(async list => {
    mocks.sent.push(list)
    if (mocks.answer instanceof Error) throw mocks.answer
    return mocks.answer || { reply: 'Do **3 sets** of 8.\n\n- Rest 2 min\n- Add 2.5 kg', left: 19, perDay: 20 }
  }),
}))
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import HerculesButton from './Hercules.jsx'

const roots = []
const flush = () => act(() => new Promise(r => setTimeout(r, 0)))
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(el))
  return host
}
function renderTopSheet() {
  const sheet = useUI.getState().sheets.at(-1)
  return mount(sheet.render(() => useUI.getState().closeSheet(sheet.id)))
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  mocks.status = { on: true, perDay: 20, left: 20 }; mocks.sent = []; mocks.answer = null
  localStorage.clear()
  useUI.setState({ sheets: [] })
  useStore.setState({ S: structuredClone(DEF), user: { id: 'u' + Math.random(), name: 'Ada' }, ready: true })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { roots.splice(0).forEach(r => r.unmount()) }) })

describe('Hercules', () => {
  it('shows on Home, not without a server account, not when the server has no key', async () => {
    let host = mount(<MemoryRouter initialEntries={['/home']}><HerculesButton /></MemoryRouter>)
    await flush()
    expect(host.querySelector('.hc-fab')).not.toBeNull()

    useStore.setState({ user: null })
    host = mount(<MemoryRouter initialEntries={['/home']}><HerculesButton /></MemoryRouter>)
    await flush()
    expect(host.querySelector('.hc-fab')).toBeNull()

    mocks.status = { on: false, perDay: 20, left: 20 }
    useStore.setState({ user: { id: 'other', name: 'B' } })
    host = mount(<MemoryRouter initialEntries={['/home']}><HerculesButton /></MemoryRouter>)
    await flush()
    expect(host.querySelector('.hc-fab')).toBeNull()
  })

  it('hides during a workout', async () => {
    useStore.setState(s => ({ S: { ...s.S, active: { entries: [] } } }))
    const host = mount(<MemoryRouter initialEntries={['/workout']}><HerculesButton /></MemoryRouter>)
    await flush()
    expect(host.querySelector('.hc-fab')).toBeNull()
  })

  it('sends a suggestion and shows the answer with its formatting and what is left', async () => {
    const fab = mount(<MemoryRouter initialEntries={['/profile']}><HerculesButton /></MemoryRouter>)
    await flush()
    act(() => fab.querySelector('.hc-fab').click())
    const chat = renderTopSheet()
    await flush()
    expect(chat.textContent).toContain('Hi, I am Hercules.')
    act(() => chat.querySelector('.hc-sugg .chip').click())
    await flush(); await flush()
    expect(mocks.sent[0].at(-1)).toMatchObject({ role: 'user', content: 'Plan my training for next week' })
    expect(chat.querySelector('.hc-m.him strong').textContent).toBe('3 sets')
    expect(chat.querySelectorAll('.hc-m.him li')).toHaveLength(2)
    expect(chat.textContent).toContain('19 messages left today')
    // kept on the device for next time
    const kept = JSON.parse(localStorage.getItem('olympus_hercules_' + useStore.getState().user.id))
    expect(kept.map(m => m.role)).toEqual(['user', 'assistant'])
  })

  it('says so when the messages for today are used up', async () => {
    mocks.answer = Object.assign(new Error('limit'), { status: 429, data: { code: 'hercules-limit' } })
    useUI.getState().openSheet(close => null)
    const { herculesSheet } = await import('./Hercules.jsx')
    useUI.setState({ sheets: [] })
    herculesSheet()
    const chat = renderTopSheet()
    await flush()
    const box = chat.querySelector('textarea')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    act(() => { setter.call(box, 'one more'); box.dispatchEvent(new Event('input', { bubbles: true })) })
    act(() => chat.querySelector('.hc-send').click())
    await flush(); await flush()
    expect(chat.querySelector('.hc-err').textContent).toContain('last message for today')
  })
})
