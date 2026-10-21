// @vitest-environment happy-dom
// Olympus: an APK built with a server address joins it with a name and a password. Home offers
// it, the sheet checks what it can before asking the server, and a refusal is said in words.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'

const mocks = vi.hoisted(() => ({ nav: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.nav }))
vi.mock('../lib/app-info.js', async importOriginal => ({ ...(await importOriginal()), DEFAULT_SERVER: 'https://olympus.example.org' }))
vi.mock('../lib/mobile.js', async importOriginal => ({ ...(await importOriginal()), MOBILE: true }))
import { AccountSheet } from './MobileOnboarding.jsx'
import Feed from './Feed.jsx'

let host, root, join
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  join = vi.fn().mockResolvedValue(undefined)
  useStore.setState({ user: null, joinServer: join })
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })
const type = (el, value) => {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true }))
}
const inputs = () => [...host.querySelectorAll('input')]
const submit = () => act(async () => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })

describe('joining the built-in server', () => {
  it('Home offers Create profile and Sign in instead of a server to set up', async () => {
    await act(async () => root.render(<Feed />))
    expect(host.textContent).toContain('Create profile')
    expect(host.textContent).toContain('Sign in')
    expect(host.textContent).not.toContain('Connect to a server')
  })

  it('creates a profile on that server with the name and password typed', async () => {
    const close = vi.fn()
    await act(async () => root.render(<AccountSheet close={close} mode="signup" />))
    const [name, , pw, again] = inputs()
    act(() => { type(name, 'Giuseppe'); type(pw, 'squat bench deadlift'); type(again, 'squat bench deadlift') })
    await submit(); await flush()
    expect(join).toHaveBeenCalledWith('https://olympus.example.org', 'signup', { name: 'Giuseppe', password: 'squat bench deadlift', email: '' }, expect.any(Function))
    expect(close).toHaveBeenCalled()
  })

  it('stops a short or mistyped password before asking the server', async () => {
    await act(async () => root.render(<AccountSheet close={() => {}} mode="signup" />))
    const [name, , pw, again] = inputs()
    act(() => { type(name, 'Giuseppe'); type(pw, 'short'); type(again, 'short') })
    await submit()
    expect(host.textContent).toContain('Use at least 10 characters.')
    act(() => { type(pw, 'squat bench deadlift'); type(again, 'squat bench deadlif') })
    await submit()
    expect(host.textContent).toContain('The two passwords are not the same.')
    expect(join).not.toHaveBeenCalled()
  })

  it('signs in, and words a wrong password', async () => {
    join.mockRejectedValueOnce(Object.assign(new Error('wrong name or password'), { status: 401, data: { code: 'bad-credentials' } }))
    await act(async () => root.render(<AccountSheet close={() => {}} mode="login" />))
    const [name, pw] = inputs()
    act(() => { type(name, 'Giuseppe'); type(pw, 'not it at all') })
    await submit(); await flush()
    expect(join).toHaveBeenCalledWith('https://olympus.example.org', 'login', expect.objectContaining({ name: 'Giuseppe', password: 'not it at all' }), expect.any(Function))
    expect(host.textContent).toContain('Wrong name, e-mail or password.')
  })
})
