// @vitest-environment happy-dom
// Olympus: Chiron's wake-up is a moving picture: a sprite sheet of 64 frames played by the clock on
// one layer that exists only while he wakes, and it ends on the last frame.
import React, { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import ChironFigure, { WAKE_FPS, WAKE_FRAMES, wakeFramePosition } from './ChironFigure.jsx'

// The frame number a background-position stands for (the inverse of wakeFramePosition).
const frameOf = pos => { const [x, y] = pos.split(' ').map(v => Math.round(parseFloat(v) / 100 * 7)); return y * 8 + x }
const roots = []
function mount(state) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  roots.push({ root, el })
  act(() => root.render(<ChironFigure state={state} size={150} />))
  return el
}
afterEach(() => { for (const { root, el } of roots.splice(0)) { act(() => root.unmount()); el.remove() }; vi.useRealTimers() })

describe('ChironFigure wake-up', () => {
  it('finds each frame in the 8 by 8 sheet', () => {
    expect(wakeFramePosition(0)).toBe('0% 0%')
    expect(wakeFramePosition(7)).toBe('100% 0%')
    expect(wakeFramePosition(WAKE_FRAMES - 1)).toBe('100% 100%')
    expect(wakeFramePosition(-5)).toBe('0% 0%')
    expect(wakeFramePosition(999)).toBe('100% 100%')
    for (let i = 0; i < WAKE_FRAMES; i++) expect(frameOf(wakeFramePosition(i))).toBe(i)
  })

  it('has the clip layer only while waking', () => {
    expect(mount('asleep').querySelector('.chf-clip')).toBeNull()
    expect(mount('idle').querySelector('.chf-clip')).toBeNull()
    expect(mount('waking').querySelector('.chf-clip')).not.toBeNull()
  })

  it('plays the frames by the clock and stops on the last one', () => {
    vi.useFakeTimers()
    const el = mount('waking')
    const clip = el.querySelector('.chf-clip')
    expect(frameOf(clip.style.backgroundPosition)).toBe(0)
    act(() => { vi.advanceTimersByTime(500) })
    // half a second in, at 24 a second: frame 12, give or take a screen refresh
    expect(Math.abs(frameOf(clip.style.backgroundPosition) - 0.5 * WAKE_FPS)).toBeLessThanOrEqual(2)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(frameOf(clip.style.backgroundPosition)).toBe(WAKE_FRAMES - 1)
  })
})
