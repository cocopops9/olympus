// Olympus: how many notifications are unread and how many follow requests wait, for the dot on
// the Home tab and the bell on the feed. Asked of the server once a minute while the app is in
// front, and at once when it comes back to the front; App starts and stops it with the session.
import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { fetchNotifications } from '../lib/social.js'

export const useSocial = create(set => ({
  unread: 0,
  requests: 0,
  // The answer is also handed back, so the notifications screen can use it directly.
  async refresh() {
    try {
      const n = await fetchNotifications()
      set({ unread: n.unread || 0, requests: n.requests || 0 })
      return n
    } catch { return null }
  },
  set: counts => set(counts),
  reset: () => set({ unread: 0, requests: 0 }),
}))

const EVERY_MS = 60000
let timer = null
let onVisible = null

export function startSocialPolling() {
  stopSocialPolling()
  const tick = () => { if (typeof document === 'undefined' || document.visibilityState !== 'hidden') useSocial.getState().refresh() }
  tick()
  timer = setInterval(tick, EVERY_MS)
  onVisible = () => { if (document.visibilityState === 'visible') tick() }
  document.addEventListener('visibilitychange', onVisible)
}

export function stopSocialPolling() {
  if (timer) clearInterval(timer)
  timer = null
  if (onVisible) document.removeEventListener('visibilitychange', onVisible)
  onVisible = null
  useSocial.getState().reset()
}

/** Runs `fn` whenever the app comes back to the front: a screen showing someone else's data
 *  (a feed, a profile) reads it again rather than showing what it had when it was opened. */
export function useWhenVisible(fn) {
  const latest = useRef(fn)
  latest.current = fn
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') latest.current() }
    document.addEventListener('visibilitychange', on)
    window.addEventListener('focus', on)
    return () => { document.removeEventListener('visibilitychange', on); window.removeEventListener('focus', on) }
  }, [])
}
