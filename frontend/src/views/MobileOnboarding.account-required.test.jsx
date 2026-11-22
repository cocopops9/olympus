// @vitest-environment happy-dom
// The Olympus phone app requires an account (2026-11-22): its welcome screen offers creating an
// account and signing in, and no way to go on without one.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { _setLangState } from '../lib/i18n-core.js'

vi.mock('../lib/app-info.js', async orig => ({ ...(await orig()), DEFAULT_SERVER: 'https://example.supabase.co/functions/v1/olympus' }))
vi.mock('../lib/api.js', async orig => ({ ...(await orig()), appConfig: async () => ({ password_login: true, allow_guest: false }) }))
import MobileOnboarding from './MobileOnboarding.jsx'

let root, host
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  _setLangState('en', null, null, null)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('MobileOnboarding with the built-in server', () => {
  it('offers an account and nothing that skips it', async () => {
    await act(async () => root.render(<MobileOnboarding />))
    const labels = [...host.querySelectorAll('button')].map(b => b.textContent.trim())
    expect(labels).toContain('Create account')
    expect(labels).toContain('Sign in')
    expect(host.textContent).not.toMatch(/without an account|as a guest|Use on this device/i)
  })
})
