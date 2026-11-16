// @vitest-environment happy-dom
// The update prompt (components/UpdatePrompt.jsx): at the start, and again when the app comes back
// after a while, since Android can keep it alive in the background for days.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

const m = vi.hoisted(() => ({ info: { hasUpdate: false }, checks: 0 }))
vi.mock('../lib/mobile.js', async o => ({ ...(await o()), MOBILE: true, isAndroid: async () => true }))
vi.mock('../lib/update.js', async o => ({ ...(await o()), UPDATES_ON: true, checkForUpdate: async () => { m.checks++; return m.info } }))
vi.mock('../lib/update-job.js', () => ({ startUpdate: vi.fn(), resumeUpdate: () => false, updateRunning: () => false }))
import { useUpdatePrompt, RECHECK_AFTER_MS } from './UpdatePrompt.jsx'
import { useUI } from '../store/useUI.js'

function Host() { useUpdatePrompt(true); return null }
let host, root
const setVisible = async v => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (v ? 'visible' : 'hidden') })
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(0) })
}
beforeEach(() => {
  vi.useFakeTimers()
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  m.info = { hasUpdate: false }; m.checks = 0
  useUI.setState({ sheets: [] })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); useUI.setState({ sheets: [] }) })

describe('the update prompt', () => {
  it('checks at the start, and again on coming back after half an hour, then offers the new build', async () => {
    await act(async () => { root.render(<Host />) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(m.checks).toBe(1)
    expect(useUI.getState().sheets).toHaveLength(0)
    m.info = { hasUpdate: true, apkUrl: 'https://x/olympus.apk', build: 77 }
    await setVisible(false)
    await setVisible(true)
    expect(m.checks).toBe(1)   // back at once: not asked again
    vi.setSystemTime(Date.now() + RECHECK_AFTER_MS + 1000)
    await setVisible(true)
    expect(m.checks).toBe(2)
    expect(useUI.getState().sheets).toHaveLength(1)
  })
})
