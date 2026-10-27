// @vitest-environment happy-dom
// Olympus: an account on the app's own server, the standard way: a unique username, an e-mail,
// the password twice; sign in with username or e-mail; a forgotten password reset with a code
// sent by e-mail. What can be checked is checked before the server is asked.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'

const mocks = vi.hoisted(() => ({ nav: vi.fn(), username: vi.fn(), forgot: vi.fn(), config: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.nav }))
vi.mock('../lib/app-info.js', async importOriginal => ({ ...(await importOriginal()), DEFAULT_SERVER: 'https://olympus.example.org' }))
vi.mock('../lib/mobile.js', async importOriginal => ({ ...(await importOriginal()), MOBILE: true }))
vi.mock('../lib/api.js', async importOriginal => ({ ...(await importOriginal()), appUsername: mocks.username, appForgot: mocks.forgot, appConfig: mocks.config }))
import { AccountSheet, _resetServerConfig } from './MobileOnboarding.jsx'
import Feed from './Feed.jsx'

let host, root, join
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  join = vi.fn().mockResolvedValue(undefined)
  mocks.username.mockReset().mockResolvedValue({ available: true })
  mocks.forgot.mockReset().mockResolvedValue({ ok: true })
  mocks.config.mockReset().mockResolvedValue({ google_client_id: null, password_reset: true })
  _resetServerConfig()
  useStore.setState({ user: null, joinServer: join })
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const flush = (ms = 0) => act(async () => { await new Promise(r => setTimeout(r, ms)) })
const type = (el, value) => {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true }))
}
const field = id => host.querySelector('#' + id)
const alertText = () => host.querySelector('[role=alert]')?.textContent
const submit = () => act(async () => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
const click = text => act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text).click() })

describe('an account on the built-in server', () => {
  it('Home offers Create account and Sign in', async () => {
    await act(async () => root.render(<Feed />))
    expect(host.textContent).toContain('Create account')
    expect(host.textContent).toContain('Sign in')
    expect(host.textContent).not.toContain('Connect to a server')
  })

  it('creates an account with a username, an e-mail and the password twice', async () => {
    const close = vi.fn()
    await act(async () => root.render(<AccountSheet close={close} mode="signup" />))
    act(() => { type(field('acct-name'), 'giuseppe_27'); type(field('acct-mail'), 'g@example.com'); type(field('acct-pw'), 'squat bench deadlift'); type(field('acct-pw2'), 'squat bench deadlift') })
    await flush(600)
    expect(mocks.username).toHaveBeenCalledWith('https://olympus.example.org', 'giuseppe_27')
    expect(host.textContent).toContain('Available')
    await submit(); await flush()
    expect(join).toHaveBeenCalledWith('https://olympus.example.org', 'signup', { name: 'giuseppe_27', password: 'squat bench deadlift', email: 'g@example.com' }, expect.any(Function))
    expect(close).toHaveBeenCalled()
  })

  it('says a username is taken while it is typed, and does not send the form', async () => {
    mocks.username.mockResolvedValue({ available: false, code: 'name-taken' })
    await act(async () => root.render(<AccountSheet close={() => {}} mode="signup" />))
    act(() => { type(field('acct-name'), 'chaos'); type(field('acct-mail'), 'c@example.com'); type(field('acct-pw'), 'squat bench deadlift'); type(field('acct-pw2'), 'squat bench deadlift') })
    await flush(600)
    expect(host.textContent).toContain('That username is taken.')
    await submit()
    expect(join).not.toHaveBeenCalled()
  })

  it('stops a bad username, a missing e-mail, a short or mistyped password before asking the server', async () => {
    await act(async () => root.render(<AccountSheet close={() => {}} mode="signup" />))
    act(() => { type(field('acct-name'), 'g!'); type(field('acct-pw'), 'squat bench deadlift'); type(field('acct-pw2'), 'squat bench deadlift') })
    await submit()
    expect(alertText()).toContain('at least 3 characters')
    act(() => { type(field('acct-name'), 'giuseppe') })
    await flush(600)
    await submit()
    expect(alertText()).toBe('Enter your e-mail.')
    act(() => { type(field('acct-mail'), 'g@example.com'); type(field('acct-pw'), 'short'); type(field('acct-pw2'), 'short') })
    await submit()
    expect(alertText()).toBe('Use at least 10 characters.')
    act(() => { type(field('acct-pw'), 'squat bench deadlift'); type(field('acct-pw2'), 'squat bench deadlif') })
    await submit()
    expect(alertText()).toBe('The two passwords are not the same.')
    expect(join).not.toHaveBeenCalled()
  })

  it('signs in with username or e-mail, and words a wrong password', async () => {
    join.mockRejectedValueOnce(Object.assign(new Error('wrong name or password'), { status: 401, data: { code: 'bad-credentials' } }))
    await act(async () => root.render(<AccountSheet close={() => {}} mode="login" />))
    act(() => { type(field('acct-name'), 'g@example.com'); type(field('acct-pw'), 'not it at all') })
    await submit(); await flush()
    expect(join).toHaveBeenCalledWith('https://olympus.example.org', 'login', { name: 'g@example.com', password: 'not it at all' }, expect.any(Function))
    expect(alertText()).toBe('Wrong name, e-mail or password.')
  })

  it('resets a forgotten password with the code sent by e-mail, and is signed in', async () => {
    const close = vi.fn()
    await act(async () => root.render(<AccountSheet close={close} mode="login" />))
    act(() => { type(field('acct-name'), 'g@example.com') })
    await click('Forgot password?')
    expect(field('acct-mail').value).toBe('g@example.com')
    await submit(); await flush()
    expect(mocks.forgot).toHaveBeenCalledWith('https://olympus.example.org', 'g@example.com')
    expect(host.textContent).toContain('a 6-digit code is on its way')
    act(() => { type(field('acct-code'), '123456'); type(field('acct-pw'), 'a brand new password'); type(field('acct-pw2'), 'a brand new password') })
    await submit(); await flush()
    expect(join).toHaveBeenCalledWith('https://olympus.example.org', 'reset', { email: 'g@example.com', resetCode: '123456', password: 'a brand new password' }, expect.any(Function))
    expect(close).toHaveBeenCalled()
  })

  it('shows Continue with Google only when the server has it set up', async () => {
    await act(async () => root.render(<AccountSheet close={() => {}} mode="login" />))
    await flush()
    expect(host.textContent).not.toContain('Continue with Google')
    act(() => root.unmount())
    root = createRoot(host)
    _resetServerConfig()
    mocks.config.mockResolvedValue({ google_client_id: '123-abc.apps.googleusercontent.com', password_reset: true })
    await act(async () => root.render(<AccountSheet close={() => {}} mode="login" />))
    await flush()
    expect(host.textContent).toContain('Continue with Google')
  })
})
