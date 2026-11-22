// Olympus: how many notifications are unread and how many follow requests wait, for the dot on
// the Home tab and the bell on the feed. Asked of the server once a minute while the app is in
// front, and at once when it comes back to the front; App starts and stops it with the session.
import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { fetchNotifications, fetchChatUnread, saveProfile } from '../lib/social.js'
import { syncPortrait } from '../lib/portrait-sync.js'
import { useStore } from './useStore.js'
import { visibleNews, newsOn, notifySoundOf } from '../lib/notify-sounds.js'
import { notifySound } from '../lib/sound.js'

// The notification sound, once for any number of things that arrived since the last count. Only
// while the app is in front: in the background the counts are not asked for at all.
function announce(now, S) {
  const before = heard
  heard = now
  if (!before) return
  if (now.news > before.news || now.messages > before.messages) notifySound(notifySoundOf(S))
}

// What the last refresh counted, so a later one can tell news that just arrived (and play the
// notification sound, lib/notify-sounds.js) from news already seen. null: nothing counted yet,
// so what is waiting when the app opens is counted, not announced.
let heard = null

export const useSocial = create(set => ({
  unread: 0,
  requests: 0,
  // Messages waiting unread, over every conversation (views/Chats.jsx).
  messages: 0,
  // The answer is also handed back, so the notifications screen can use it directly. The counts
  // leave out the kinds of news switched off in Settings → Notifications (S.newsOff).
  async refresh() {
    try {
      const n = await fetchNotifications()
      const { user, S } = useStore.getState()
      const { unread } = visibleNews(S, n.items)
      const requests = newsOn(S, 'request') ? n.requests || 0 : 0
      set({ unread, requests })
      fetchChatUnread().then(messages => {
        set({ messages })
        announce({ news: unread + requests, messages }, S)
      })
      // The portrait this profile shows without a picture of its own, sent once (and again if its sex changes).
      syncPortrait(user, S, saveProfile)
      return n
    } catch { return null }
  },
  set: counts => set(counts),
  reset: () => { heard = null; set({ unread: 0, requests: 0, messages: 0 }) },
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
