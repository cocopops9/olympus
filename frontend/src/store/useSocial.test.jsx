// @vitest-environment happy-dom
// A screen showing other people's data reads it again when the app comes back to the front.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useWhenVisible } from './useSocial.js'

let host, root
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()) })

function Probe({ fn }) { useWhenVisible(fn); return null }

describe('useWhenVisible', () => {
  it('calls the latest function on focus and on becoming visible, and stops when unmounted', () => {
    const first = vi.fn(), second = vi.fn()
    act(() => root.render(<Probe fn={first} />))
    act(() => root.render(<Probe fn={second} />))
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(2)
    act(() => root.unmount())
    window.dispatchEvent(new Event('focus'))
    expect(second).toHaveBeenCalledTimes(2)
    root = createRoot(host)
  })
})
