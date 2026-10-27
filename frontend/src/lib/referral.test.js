// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('./api.js', () => ({ api: vi.fn(async () => ({ ok: true })) }))
import { api } from './api.js'
import { refFromLocation, captureInvite, pendingInvite, clearPendingInvite, cleanCode, inviteShareText, APK_URL } from './referral.js'
import { startTelemetry, stopTelemetry, track, trackScreen, flush, _setSender, _state, _reset, FEATURES } from './telemetry.js'

describe('invites', () => {
  beforeEach(() => { localStorage.clear() })
  it('reads ?ref= from the search or from after the hash route', () => {
    expect(refFromLocation({ search: '?ref=ab2-cd3', hash: '' })).toBe('AB2CD3')
    expect(refFromLocation({ search: '', hash: '#/home?ref=xyz789' })).toBe('XYZ789')
    expect(refFromLocation({ search: '', hash: '#/home' })).toBe('')
  })
  it('keeps a captured code until the account is made', () => {
    captureInvite({ search: '?ref=HELLO2', hash: '' })
    expect(pendingInvite()).toBe('HELLO2')
    captureInvite({ search: '', hash: '' })   // a later start without a code keeps it
    expect(pendingInvite()).toBe('HELLO2')
    clearPendingInvite()
    expect(pendingInvite()).toBe('')
  })
  it('cleans what a person types and says where to get the app', () => {
    expect(cleanCode(' ab c-12 ')).toBe('ABC12')
    const text = inviteShareText('K7M2QP')
    expect(text).toContain(APK_URL)
    expect(text).toContain('K7M2QP')
  })
})

describe('usage statistics', () => {
  beforeEach(() => { _reset(); localStorage.clear() })
  it('collects nothing without consent', async () => {
    const send = vi.fn(async () => ({ ok: true }))
    _setSender(send)
    track('workout.finish')
    trackScreen('/stats')
    await flush()
    expect(send).not.toHaveBeenCalled()
    expect(_state().queue).toEqual([])
  })
  it('sends sessions, screens and features with consent, and keeps them when offline', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-27T10:00:00Z') })
    const send = vi.fn(async () => { throw new Error('offline') })
    _setSender(send)
    startTelemetry('/home')
    vi.advanceTimersByTime(5000)
    trackScreen('/stats')
    track('workout.finish')
    track('nope bad name')
    await flush()
    expect(send).toHaveBeenCalled()
    const kept = _state().queue
    expect(kept.map(e => e.type)).toEqual(['open', 'screen', 'event'])
    expect(kept[1]).toMatchObject({ path: '/home', sec: 5 })
    expect(kept[2]).toMatchObject({ name: 'workout.finish' })
    expect(send.mock.calls[0][0]).toMatchObject({ consent: true })
    send.mockImplementation(async () => ({ ok: true }))
    await flush()
    expect(_state().queue).toEqual([])
    await stopTelemetry()
    vi.useRealTimers()
  })
  it('turned off, drops what is waiting', async () => {
    _setSender(async () => { throw new Error('offline') })
    startTelemetry('/home')
    track('coach.ask')
    await stopTelemetry({ forget: true })
    expect(_state().queue).toEqual([])
    expect(_state().enabled).toBe(false)
    expect(api).toHaveBeenCalledWith('/api/telemetry/forget', expect.objectContaining({ method: 'POST' }))
  })
  it('every known feature has a valid event name', () => {
    for (const f of FEATURES) expect(f).toMatch(/^[a-z][a-z0-9_.-]{1,39}$/)
  })
})
