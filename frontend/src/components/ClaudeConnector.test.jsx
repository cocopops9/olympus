// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClaudeConnectorPage, ChatGPTConnectorPage, CLAUDE_CONNECTORS, CHATGPT_PLUGINS } from './ClaudeConnector.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* Settings → Connect to Claude (supabase/functions/olympus/core.js /api/connector). One tap makes
   the address, copies it and opens Claude's connectors page; the address is known only then.
   Afterwards the page says when it was made and used, and replaces or removes it after a
   confirmation. */
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

const URL = 'https://proj.functions.supabase.co/olympus-mcp/' + 'a'.repeat(43)
const mounted = []
function mount(Page = ClaudeConnectorPage) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(<Page />))
  return host
}
const settle = () => act(() => new Promise(r => setTimeout(r, 0)))
const text = host => host.textContent
const button = (host, label) => [...host.querySelectorAll('button')].find(b => b.textContent.includes(label))

beforeEach(() => { mocks.answers = {}; mocks.calls = []; mocks.confirms = []; mocks.toast.mockClear(); mocks.copy.mockClear() })
afterEach(() => { for (const { root, host } of mounted.splice(0)) { act(() => root.unmount()); host.remove() } })

describe('Connect to Claude', () => {
  it('off: one tap makes the address, copies it and opens Claude’s connectors page', async () => {
    mocks.answers['GET /api/connector'] = { available: true, on: false, created: null, used: null }
    mocks.answers['POST /api/connector'] = { url: URL, created: Date.parse('2026-11-22T12:00:00Z') }
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
    const host = mount()
    await settle()
    act(() => button(host, 'Connect Claude').click())
    await settle()
    expect(mocks.copy).toHaveBeenCalledWith(URL)
    expect(mocks.toast).toHaveBeenCalledWith('Address copied: now finish in Claude.')
    expect(opened).toHaveBeenCalledWith(CLAUDE_CONNECTORS, '_blank', 'noopener')
    expect(text(host)).toContain('Finish in Claude')
    expect(text(host)).toContain('Add it in Claude only once')
    expect(button(host, 'Connect Claude')).toBeUndefined()
    // the second chance, for a browser that blocked the first opening or a lost clipboard
    act(() => button(host, 'Open Claude').click())
    expect(opened).toHaveBeenCalledTimes(2)
    act(() => button(host, 'Copy the address').click())
    await settle()
    expect(mocks.copy).toHaveBeenCalledTimes(2)
    // nothing has reached the connector yet, so it is not called connected
    expect(text(host)).toContain('Not added in Claude yet')
    expect(text(host)).not.toContain('Last used by Claude')
    opened.mockRestore()
  })

  it('made but never used: the steps stay, and a lost address is replaced in one tap', async () => {
    mocks.answers['GET /api/connector'] = { available: true, on: true, created: Date.parse('2026-11-22T12:00:00Z'), used: null }
    mocks.answers['POST /api/connector'] = { url: URL, created: Date.parse('2026-11-22T13:00:00Z') }
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
    const host = mount()
    await settle()
    expect(text(host)).toContain('Not added in Claude yet')
    expect(text(host)).toContain('Open claude.ai in your browser')
    expect(button(host, 'Copy the address')).toBeUndefined()
    act(() => button(host, 'Copy a new address').click())
    await settle()
    expect(mocks.calls.some(c => c.path === '/api/connector' && c.method === 'POST')).toBe(true)
    expect(mocks.copy).toHaveBeenCalledWith(URL)
    expect(button(host, 'Copy the address')).toBeTruthy()
    // Claude reaches it while the athlete is away: coming back shows it connected
    mocks.answers['GET /api/connector'] = { available: true, on: true, created: Date.parse('2026-11-22T13:00:00Z'), used: Date.parse('2026-11-22T13:05:00Z') }
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await new Promise(r => setTimeout(r, 0)) })
    expect(text(host)).toContain('Last used by Claude')
    expect(text(host)).not.toContain('Not added in Claude yet')
    opened.mockRestore()
  })

  it('made before: the server gives the same address again, so copying never replaces it', async () => {
    mocks.answers['GET /api/connector'] = { available: true, on: true, created: Date.parse('2026-11-22T12:00:00Z'), used: null, url: URL }
    const host = mount()
    await settle()
    expect(button(host, 'Copy a new address')).toBeUndefined()
    act(() => button(host, 'Copy the address').click())
    await settle()
    expect(mocks.copy).toHaveBeenCalledWith(URL)
    expect(mocks.calls.some(c => c.method === 'POST')).toBe(false)
    // once Claude has used it, the address can still be copied from the connection section
    mocks.answers['GET /api/connector'] = { available: true, on: true, created: Date.parse('2026-11-22T12:00:00Z'), used: Date.parse('2026-11-22T12:05:00Z'), url: URL }
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await new Promise(r => setTimeout(r, 0)) })
    act(() => button(host, 'Copy the address').click())
    await settle()
    expect(mocks.copy).toHaveBeenCalledTimes(2)
    expect(mocks.calls.some(c => c.method === 'POST')).toBe(false)
  })

  it('on: says when it was used, and disconnects only after the confirmation', async () => {
    mocks.answers['GET /api/connector'] = { available: true, on: true, created: Date.parse('2026-11-01T12:00:00Z'), used: Date.parse('2026-11-20T12:00:00Z') }
    const host = mount()
    await settle()
    expect(text(host)).toContain('Last used by Claude')
    expect(text(host)).not.toContain('Not added in Claude yet')
    expect(button(host, 'Connect Claude')).toBeUndefined()
    act(() => button(host, 'Disconnect Claude').click())
    expect(mocks.calls.some(c => c.path === '/api/connector/delete')).toBe(false)
    expect(mocks.confirms).toHaveLength(1)
    await act(async () => { await mocks.confirms[0].onConfirm() })
    expect(mocks.calls.some(c => c.path === '/api/connector/delete' && c.method === 'POST')).toBe(true)
    expect(mocks.toast).toHaveBeenCalledWith('Claude disconnected')
    expect(button(host, 'Connect Claude')).toBeTruthy()
  })

  it('a server without the connector says so and offers nothing to press', async () => {
    mocks.answers['GET /api/connector'] = Object.assign(new Error('not found'), { status: 404 })
    const host = mount()
    await settle()
    expect(text(host)).toContain('This server does not offer the Claude connector.')
    expect(button(host, 'Connect Claude')).toBeUndefined()
  })
})

/* Settings → Connect to ChatGPT: the same page on ChatGPT's own address (?for=chatgpt), so making,
   copying or removing it never touches the address Claude has. */
describe('Connect to ChatGPT', () => {
  const GPT = '/api/connector?for=chatgpt'
  it('off: one tap makes ChatGPT’s own address, copies it and opens ChatGPT’s plugins', async () => {
    mocks.answers['GET ' + GPT] = { for: 'chatgpt', available: true, on: false, created: null, used: null }
    mocks.answers['POST ' + GPT] = { for: 'chatgpt', url: URL, created: Date.parse('2026-11-23T12:00:00Z') }
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
    const host = mount(ChatGPTConnectorPage)
    await settle()
    expect(mocks.calls[0]).toEqual({ path: GPT, method: 'GET' })
    act(() => button(host, 'Connect ChatGPT').click())
    await settle()
    expect(mocks.calls.some(c => c.path === GPT && c.method === 'POST')).toBe(true)
    expect(mocks.calls.some(c => c.path === '/api/connector')).toBe(false)
    expect(mocks.copy).toHaveBeenCalledWith(URL)
    expect(mocks.toast).toHaveBeenCalledWith('Address copied: now finish in ChatGPT.')
    expect(opened).toHaveBeenCalledWith(CHATGPT_PLUGINS, '_blank', 'noopener')
    expect(text(host)).toContain('Open chatgpt.com in your browser')
    expect(text(host)).toContain('No authentication')
    expect(text(host)).not.toContain('Claude')
    opened.mockRestore()
  })

  it('on: disconnecting removes ChatGPT’s address only, after the confirmation', async () => {
    mocks.answers['GET ' + GPT] = { for: 'chatgpt', available: true, on: true, created: Date.parse('2026-11-01T12:00:00Z'), used: Date.parse('2026-11-20T12:00:00Z') }
    const host = mount(ChatGPTConnectorPage)
    await settle()
    expect(text(host)).toContain('Last used by ChatGPT')
    act(() => button(host, 'Disconnect ChatGPT').click())
    expect(mocks.confirms[0].title).toBe('Disconnect ChatGPT?')
    await act(async () => { await mocks.confirms[0].onConfirm() })
    expect(mocks.calls.some(c => c.path === '/api/connector/delete?for=chatgpt' && c.method === 'POST')).toBe(true)
    expect(mocks.calls.some(c => c.path === '/api/connector/delete')).toBe(false)
    expect(mocks.toast).toHaveBeenCalledWith('ChatGPT disconnected')
  })

  it('a server older than ChatGPT’s address answers with Claude’s: shown as not offered, nothing to press', async () => {
    mocks.answers['GET ' + GPT] = { available: true, on: true, created: Date.parse('2026-11-01T12:00:00Z'), used: Date.parse('2026-11-20T12:00:00Z'), url: URL }
    const host = mount(ChatGPTConnectorPage)
    await settle()
    expect(text(host)).toContain('This server does not offer the ChatGPT connector.')
    expect(button(host, 'Disconnect ChatGPT')).toBeUndefined()
    expect(button(host, 'Copy the address')).toBeUndefined()
  })
})
