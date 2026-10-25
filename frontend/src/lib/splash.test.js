// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { startSplash, MIN_MS, MAX_MS, FADE_MS } from './splash.js'

function fakeStore(ready = false) {
  let state = { ready }
  const subs = new Set()
  return {
    getState: () => state,
    subscribe: fn => { subs.add(fn); return () => subs.delete(fn) },
    set(next) { state = { ...state, ...next }; subs.forEach(fn => fn(state)) },
  }
}

describe('launch splash', () => {
  let t
  const clock = () => t
  beforeEach(() => {
    vi.useFakeTimers()
    t = 0
    document.body.innerHTML = '<div id="splash"></div>'
  })
  afterEach(() => vi.useRealTimers())
  const advance = ms => { t += ms; vi.advanceTimersByTime(ms) }
  const shown = () => !!document.getElementById('splash')
  const fading = () => document.getElementById('splash')?.classList.contains('out')

  it('does nothing when the page has no splash', () => {
    document.body.innerHTML = ''
    expect(() => startSplash(fakeStore(), { now: clock })()).not.toThrow()
  })

  it('stays while the app is not ready, however long the minimum has passed', () => {
    startSplash(fakeStore(false), { now: clock })
    advance(MIN_MS + 3000)
    expect(shown()).toBe(true)
    expect(fading()).toBe(false)
  })

  it('waits out the minimum when the app is ready early, then fades and goes', () => {
    const store = fakeStore(false)
    startSplash(store, { now: clock })
    advance(400)
    store.set({ ready: true })
    advance(MIN_MS - 400 - 10)
    expect(fading()).toBe(false)
    advance(20)
    expect(fading()).toBe(true)
    advance(FADE_MS + 150)
    expect(shown()).toBe(false)
  })

  it('goes at once when the app became ready after the minimum', () => {
    const store = fakeStore(false)
    startSplash(store, { now: clock })
    advance(MIN_MS + 1500)
    store.set({ ready: true })
    expect(fading()).toBe(true)
  })

  it('goes after the maximum even if the server never answers', () => {
    startSplash(fakeStore(false), { now: clock })
    advance(MAX_MS + 10)
    expect(fading()).toBe(true)
    advance(FADE_MS + 150)
    expect(shown()).toBe(false)
  })

  it('can be ended by hand, and only once', () => {
    const hide = startSplash(fakeStore(false), { now: clock })
    hide(); hide()
    expect(fading()).toBe(true)
  })
})
