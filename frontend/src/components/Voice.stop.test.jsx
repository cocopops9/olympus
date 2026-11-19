// @vitest-environment happy-dom
// Olympus: the microphone of the coach chats can always be closed. While it listens the button is
// a stop square, and a stop tapped while the microphone is still opening closes it once it is open
// (before, that tap did nothing and the microphone stayed on).
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

const m = vi.hoisted(() => ({ resolveListen: null, stopper: null }))
vi.mock('../lib/voice.js', async orig => ({
  ...(await orig()),
  canListen: async () => true,
  releaseMic: () => {},
  listen: vi.fn(() => new Promise(r => { m.resolveListen = r })),
}))
import { MicButton } from './Voice.jsx'

let host, root
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); m.stopper = vi.fn() })
afterEach(() => { act(() => root.unmount()); host.remove() })
const flush = () => act(() => new Promise(r => setTimeout(r, 0)))

describe('the dictation microphone', () => {
  it('shows a stop square while listening, and a stop tapped while it opens closes it', async () => {
    await act(async () => root.render(<MicButton onText={() => {}} onFinal={() => {}} />))
    await flush()
    const btn = host.querySelector('button.mic')
    expect(btn.querySelector('.mic-stop')).toBeNull()
    await act(async () => btn.click())             // start: the microphone is opening
    expect(host.querySelector('button.mic .mic-stop')).not.toBeNull()
    expect(btn.getAttribute('aria-label')).toBe('Stop dictation')
    await act(async () => btn.click())             // stop before it is open
    await act(async () => m.resolveListen(m.stopper))
    await flush()
    expect(m.stopper).toHaveBeenCalledTimes(1)
  })
})
