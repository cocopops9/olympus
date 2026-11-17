// Olympus: a frame of a video, small, kept on this device. A workout whose post has a video shows
// that frame where a photo would go in the lists (sheets.jsx WorkoutRow, lib/workout-cover.js).
//
// The frame is taken when the clip is chosen (components/Video.jsx), while the phone has it. A video
// posted from another phone, or before this version, has no frame here yet: captureMissing()
// fetches the newest few once and takes it from them. A cache, never synced.
import { useSyncExternalStore } from 'react'
import { videoBlob } from './social.js'

const KEY = 'olympus_vframes'
const MAX = 40            // frames kept, newest last; each is about 3 KB
const SIZE = 112          // pixels, square (shown at 34, so this stays sharp on a dense screen)
const ID = /^[A-Za-z0-9_-]{1,64}$/

let frames = null
const listeners = new Set()
const load = () => {
  if (frames) return frames
  try { const v = JSON.parse(localStorage.getItem(KEY)); frames = v && typeof v === 'object' && !Array.isArray(v) ? v : {} } catch { frames = {} }
  return frames
}
const save = next => {
  const keys = Object.keys(next)
  frames = keys.length > MAX ? Object.fromEntries(keys.slice(-MAX).map(k => [k, next[k]])) : next
  try { localStorage.setItem(KEY, JSON.stringify(frames)) } catch { /* kept for this run */ }
  for (const fn of listeners) fn()
}

/** The frame (a data URL) of video `id`, or null. */
export const frameOf = id => (id && load()[id]) || null
export function setFrame(id, dataUrl) {
  if (!ID.test(String(id || '')) || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return
  if (load()[id] === dataUrl) return
  const { [id]: _old, ...rest } = load()
  save({ ...rest, [id]: dataUrl })
}
export const useFrame = id => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn) }, () => frameOf(id), () => null)
export const _resetFrames = () => { frames = null; listeners.clear() }

/**
 * A square JPEG data URL of a moment of the video (a Blob, or a URL the page can read), or null when
 * the phone cannot decode it. Taken a little way in, so it is not the black first frame.
 */
export function extractFrame(source, { timeout = 9000 } = {}) {
  return new Promise(resolve => {
    if (typeof document === 'undefined') return resolve(null)
    const url = typeof source === 'string' ? source : URL.createObjectURL(source)
    const v = document.createElement('video')
    let done = false
    const finish = out => {
      if (done) return
      done = true
      clearTimeout(timer)
      v.removeAttribute('src'); try { v.load() } catch { /* gone */ }
      if (typeof source !== 'string') URL.revokeObjectURL(url)
      resolve(out)
    }
    const timer = setTimeout(() => finish(null), timeout)
    v.muted = true; v.playsInline = true; v.preload = 'auto'
    v.onerror = () => finish(null)
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) ? v.duration : 0
      try { v.currentTime = Math.min(0.6, d / 2) } catch { finish(null) }
    }
    v.onseeked = () => {
      try {
        const w = v.videoWidth, h = v.videoHeight
        if (!w || !h) return finish(null)
        const c = document.createElement('canvas')
        c.width = c.height = SIZE
        const side = Math.min(w, h)
        c.getContext('2d').drawImage(v, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE)
        finish(c.toDataURL('image/jpeg', 0.62))
      } catch { finish(null) }
    }
    v.src = url
  })
}

/** Takes the frame of video `id` from its blob and keeps it. Resolves to whether it did. */
export async function rememberFrame(id, source) {
  const f = await extractFrame(source)
  if (!f) return false
  setFrame(id, f)
  return true
}

/**
 * The newest `max` posts of yours with a video and no frame here yet: fetched, framed, forgotten.
 * Once per start (lib/auto-post.js); a failure is simply tried again next time.
 */
export async function captureMissing(posts, max = 4, get = videoBlob) {
  if (!Array.isArray(posts)) return 0
  const todo = posts.filter(p => p?.video?.id && !frameOf(p.video.id)).slice(0, max)
  let n = 0
  for (const p of todo) {
    try { if (await rememberFrame(p.video.id, await get(p.video.id))) n++ } catch { /* next start */ }
  }
  return n
}
