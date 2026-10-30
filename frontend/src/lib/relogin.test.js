// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { versionChanged, reloginOnNewVersion, readInstalled, markInstalled } from './relogin.js'

describe('sign in again after an install or an update', () => {
  beforeEach(() => localStorage.clear())
  it('tells a new version from the same one', () => {
    expect(versionChanged(null, '1.4.1+1060')).toBe(true)
    expect(versionChanged('1.4.1+1059', '1.4.1+1060')).toBe(true)
    expect(versionChanged('1.4.1+1060', '1.4.1+1060')).toBe(false)
  })
  it('signs out once, keeping owed changes aside, then not again for the same version', async () => {
    const signOut = vi.fn(async () => ({ owed: true, stashed: true, count: 2 }))
    expect(await reloginOnNewVersion({ current: 'v2', signedIn: true, signOut })).toBe(true)
    expect(signOut).toHaveBeenCalledWith({ force: true })
    expect(readInstalled()).toBe('v2')
    expect(await reloginOnNewVersion({ current: 'v2', signedIn: true, signOut })).toBe(false)
    expect(signOut).toHaveBeenCalledTimes(1)
  })
  it('a fresh install with nobody signed in just remembers the version', async () => {
    const signOut = vi.fn()
    expect(await reloginOnNewVersion({ current: 'v1', signedIn: false, signOut })).toBe(false)
    expect(signOut).not.toHaveBeenCalled()
    expect(readInstalled()).toBe('v1')
  })
  it('never loses changes: when they could not be kept aside, it tries again next start', async () => {
    markInstalled('v1')
    const signOut = vi.fn(async () => ({ owed: true, stashed: false }))
    expect(await reloginOnNewVersion({ current: 'v2', signedIn: true, signOut })).toBe(false)
    expect(readInstalled()).toBe('v1')
  })
})
