// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailSheet } from './AccountEdit.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* Olympus: changing the account's e-mail (supabase/functions/olympus/core.js POST
   /api/account/email and /confirm). The address and the current password first, then the code
   the server sent to the new address; a server that cannot send e-mail saves it at once. */
const mocks = vi.hoisted(() => {
  const state = { answers: {}, calls: [] }
  state.toast = vi.fn()
  state.api = vi.fn(async (path, init) => {
    state.calls.push({ path, method: init?.method || 'GET', body: init?.body ? JSON.parse(init.body) : null })
    const a = state.answers[(init?.method || 'GET') + ' ' + path]
    if (a instanceof Error) throw a
    return a ?? {}
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const snap = () => ({ S: {}, user: { id: 'u1', name: 'Ana' }, update: () => {} })
  const useStore = selector => selector ? selector(snap()) : snap()
  useStore.getState = snap
  useStore.setState = () => {}
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: (...a) => mocks.toast(...a), openSheet: () => ({}) })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../lib/api.js', () => ({ api: (...a) => mocks.api(...a), webauthnOK: () => false, passkeyAssertion: vi.fn() }))

const fail = (status, data) => Object.assign(new Error(data?.error || 'HTTP ' + status), { status, data })
const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(el))
  return host
}
const settle = () => act(() => new Promise(r => setTimeout(r, 0)))
function type(el, value) {
  act(() => {
    Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const byPlaceholder = (host, p) => host.querySelector(`input[placeholder="${p}"]`)
const submit = async host => { act(() => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }); await settle() }
const alertText = host => host.querySelector('[role="alert"]')?.textContent || null
const posts = () => mocks.calls.filter(c => c.method === 'POST')

beforeEach(() => { mocks.answers = {}; mocks.calls.length = 0; mocks.toast.mockClear() })
afterEach(() => { act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }) })

function open(status) {
  const close = vi.fn(), done = vi.fn()
  return { host: mount(<EmailSheet status={status} close={close} done={done} />), close, done }
}

describe('EmailSheet', () => {
  it('asks for the address and the password, then the code sent to the new address', async () => {
    mocks.answers['POST /api/account/email'] = { ok: true, pending: true, email: 'new@example.com' }
    mocks.answers['POST /api/account/email/confirm'] = { ok: true, email: 'new@example.com' }
    const { host, close, done } = open({ set: true, email: 'ana@example.com', emailCodes: true })
    expect(host.textContent).toContain('Now: ana@example.com')
    type(byPlaceholder(host, 'New e-mail address'), 'ana@example.com')
    await submit(host)
    expect(alertText(host)).toBe('That is already your sign-in e-mail.')
    type(byPlaceholder(host, 'New e-mail address'), ' New@Example.com ')
    await submit(host)
    expect(alertText(host)).toBe('Enter your password.')
    expect(posts()).toEqual([])
    type(byPlaceholder(host, 'Current password'), 'correct horse battery')
    await submit(host)
    expect(posts()).toEqual([{ path: '/api/account/email', method: 'POST', body: { email: 'New@Example.com', current: 'correct horse battery' } }])
    // The code step.
    expect(host.textContent).toContain('We sent a 6-digit code to New@Example.com')
    type(byPlaceholder(host, '000000'), '12 34')
    await submit(host)
    expect(alertText(host)).toBe('Enter the 6-digit code from the e-mail.')
    type(byPlaceholder(host, '000000'), '123 456')
    await submit(host)
    expect(posts().at(-1)).toEqual({ path: '/api/account/email/confirm', method: 'POST', body: { code: '123456' } })
    expect(close).toHaveBeenCalled()
    expect(done).toHaveBeenCalledWith('new@example.com')
    expect(mocks.toast).toHaveBeenCalledWith('E-mail saved')
  })

  it('says what went wrong in words, and keeps the sheet open', async () => {
    mocks.answers['POST /api/account/email'] = fail(403, { code: 'current-wrong' })
    const { host, close } = open({ set: true, email: 'ana@example.com', emailCodes: true })
    type(byPlaceholder(host, 'New e-mail address'), 'new@example.com')
    type(byPlaceholder(host, 'Current password'), 'nope')
    await submit(host)
    expect(alertText(host)).toBe('That password is not right.')
    mocks.answers['POST /api/account/email'] = fail(409, { code: 'email-taken' })
    await submit(host)
    expect(alertText(host)).toBe('Another profile already uses this e-mail address.')
    expect(close).not.toHaveBeenCalled()
  })

  it('a profile made with Google has no password to give; a wrong code is said', async () => {
    mocks.answers['POST /api/account/email'] = { ok: true, pending: true, email: 'new@example.com' }
    mocks.answers['POST /api/account/email/confirm'] = fail(400, { code: 'code-wrong' })
    const { host } = open({ set: false, email: 'gia@gmail.com', emailCodes: true })
    expect(byPlaceholder(host, 'Current password')).toBeNull()
    type(byPlaceholder(host, 'New e-mail address'), 'new@example.com')
    await submit(host)
    expect(posts()[0].body).toEqual({ email: 'new@example.com' })
    type(byPlaceholder(host, '000000'), '000000')
    await submit(host)
    expect(alertText(host)).toBe('That code is not right. Check the e-mail and try again.')
  })

  it('opens on the code step while a code is on its way', () => {
    const { host } = open({ set: true, email: 'ana@example.com', emailPending: 'new@example.com', emailCodes: true })
    expect(host.textContent).toContain('We sent a 6-digit code to new@example.com')
  })

  it('a server that sends no e-mail saves the address at once', async () => {
    mocks.answers['POST /api/account/email'] = { ok: true, email: 'new@example.com' }
    const { host, close } = open({ set: true, email: 'ana@example.com', emailCodes: false })
    type(byPlaceholder(host, 'New e-mail address'), 'new@example.com')
    type(byPlaceholder(host, 'Current password'), 'pw')
    await submit(host)
    expect(close).toHaveBeenCalled()
    expect(posts()).toHaveLength(1)
  })
})
