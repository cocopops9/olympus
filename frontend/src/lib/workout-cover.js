// Olympus: the picture of a workout in the lists (sheets.jsx WorkoutRow). A photo kept with the
// workout itself comes first; otherwise the first photo of the workout's post in the feed.
//
// A post's photos live on the server, and once a post is sent the app no longer holds them, so
// this keeps, on this device, the first photo id of each posted workout: { [workout id]: photo id }.
// It is filled when photos are chosen for a post, when a post comes back from the server, and
// once per start from your own posts (learnCovers), so workouts posted from another phone or
// before this version get their picture too. A cache, never synced: it can always be learned again.
import { useSyncExternalStore } from 'react'

const KEY = 'olympus_wcover'
const MAX = 400
const ID = /^[A-Za-z0-9_-]{1,64}$/

let covers = null
const listeners = new Set()
const load = () => {
  if (covers) return covers
  try { const v = JSON.parse(localStorage.getItem(KEY)); covers = v && typeof v === 'object' && !Array.isArray(v) ? v : {} } catch { covers = {} }
  return covers
}
const save = next => {
  // The newest MAX entries: older workouts keep their routine icon.
  const keys = Object.keys(next)
  covers = keys.length > MAX ? Object.fromEntries(keys.slice(-MAX).map(k => [k, next[k]])) : next
  try { localStorage.setItem(KEY, JSON.stringify(covers)) } catch { /* kept for this run */ }
  for (const fn of listeners) fn()
}

/** The cover photo id of workout `wid`, or null. */
export const coverOf = wid => (wid && load()[wid]) || null

/** Sets (or, with no photo, clears) the cover of `wid`. */
export function setCover(wid, photoId) {
  if (!wid) return
  const cur = load()
  const id = typeof photoId === 'string' && ID.test(photoId) ? photoId : null
  if ((cur[wid] || null) === id) return
  const next = { ...cur }
  if (id) next[wid] = id; else delete next[wid]
  save(next)
}

/** Learns the covers of your own posts that came from a workout (they carry `wid`). */
export function learnCovers(posts) {
  if (!Array.isArray(posts)) return
  const cur = load()
  let next = null
  for (const p of posts) {
    if (!p?.wid) continue
    const id = Array.isArray(p.photos) && typeof p.photos[0] === 'string' && ID.test(p.photos[0]) ? p.photos[0] : null
    if ((cur[p.wid] || null) === id) continue
    next = next || { ...cur }
    if (id) next[p.wid] = id; else delete next[p.wid]
  }
  if (next) save(next)
}

/** The cover of `wid`, kept up to date in a component. */
export function useCover(wid) {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn) }, () => coverOf(wid), () => null)
}

export const _resetCovers = () => { covers = null; listeners.clear() }
