// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClaudeConnectorPage } from './ClaudeConnector.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* Settings → Connect to Claude (supabase/functions/olympus/core.js /api/connector). The address
   is shown once, right after it is made; afterwards the page says when it was made and used,
   and replaces or removes it after a confirmation. */
const mocks = vi.hoisted(() => {
  const state = { answers: {}, calls: [], confirms: [] }
  state.toast = vi.fn()
  state.copy = vi.fn(async () => true)
  state.api = vi.fn(async (path, init) => {
    state.calls.push({ path, method: init?.method || 'GET' })
    const a = state.answers[(init?.method || 'GET') + ' ' + path]
    if (a instanceof Error) throw a
    return typeof a === 'function' ? a() : a ?? {}
  })
  return state
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: (...a) => mocks.toast(...a), openSheet: () => ({}) })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../lib/api.js', () => ({ api: (...a) => mocks.api(...a) }))
vi.mock('../lib/clipboard.js', () => ({ copyText: (...a) => mocks.copy(...a) }))
vi.mock('../sheets.jsx', () => ({ confirmSheet: opts => mocks.confirms.push(opts) }))

const URL = 'https://proj.supabase.co/functions/v1/olympus-mcp/' + 'a'.repeat(43)
const mounted = []
function mount() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(<ClaudeConnectorPage />))
  return host
}
const settle = () => act(() => new Promise(r => setTimeout(r, 0)))
const text = host => host.textContent
const button = (host, label) => [...host.querySelectorAll('button')].find(b => b.textContent.includes(label))

beforeEach(() => { mocks.answers = {}; mocks.calls = []; mocks.confirms = []; mocks.toast.mockClear(); mocks.copy.mockClear() })
afterEach(() => { for (const { root, host } of mounted.splice(0)) { act(() => root.unmount()); host.remove() } })

describe('Connect to Claude', () => {
  it('off: one button makes the address, which is shown once with a copy button', async () => {
    mocks.answers['GET /api/connector'] = { available: true, on: false, created: null, used: null }
    mocks.answers['POST /api/connector'] = { url: URL, created: Date.parse('2026-11-22T12:00:00Z') }
    const host = mount()
    await settle()
    expect(text(host)).not.toContain(URL)
    act(() => button(host, 'Make my connector address').click())
    await settle()
    expect(text(host)).toContain(URL)
    expect(text(host)).toContain('Shown only now.')
    act(() => button(host, 'Copy the address').click())
    await settle()
    expect(mocks.copy).toHaveBeenCalledWith(URL)
    expect(mocks.toast).toHaveBeenCalledWith('Address copied')
    expect(text(host)).toContain('Not yet')
  })

  it('on: says when it was used, and disconnects only after the confirmation', async () => {
    mocks.answers['GET /api/connector'] = { available: true, on: true, created: Date.parse('2026-11-01T12:00:00Z'), used: Date.parse('2026-11-20T12:00:00Z') }
    const host = mount()
    await settle()
    expect(text(host)).toContain('Last used by Claude')
    expect(text(host)).not.toContain('Not yet')
    expect(button(host, 'Make my connector address')).toBeUndefined()
    act(() => button(host, 'Disconnect Claude').click())
    expect(mocks.calls.some(c => c.path === '/api/connector/delete')).toBe(false)
    expect(mocks.confirms).toHaveLength(1)
    await act(async () => { await mocks.confirms[0].onConfirm() })
    expect(mocks.calls.some(c => c.path === '/api/connector/delete' && c.method === 'POST')).toBe(true)
    expect(mocks.toast).toHaveBeenCalledWith('Claude disconnected')
    expect(button(host, 'Make my connector address')).toBeTruthy()
  })

  it('a server without the connector says so and offers nothing to press', async () => {
    mocks.answers['GET /api/connector'] = Object.assign(new Error('not found'), { status: 404 })
    const host = mount()
    await settle()
    expect(text(host)).toContain('This server does not offer the Claude connector.')
    expect(button(host, 'Make my connector address')).toBeUndefined()
    expect(text(host)).toContain('How to connect')
  })
})
