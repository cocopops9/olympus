// Olympus: the short video of a post. The person picks a video on the phone, chooses the part to
// share (30 seconds at most) and the app shrinks it before it goes up, because a post's video is a
// moment, not a film: a phone's own video is tens of megabytes, the server keeps 3 MB at most.
//
// How: the chosen part is played in a hidden <video>, drawn on a canvas scaled down to 480 pixels
// on its short side, and recorded with MediaRecorder together with its sound, which goes to the
// recorder and not to the speakers. That runs in real time, so a 30 second clip takes about 30
// seconds; the bit rate falls with the length so the file stays under the limit. A video that is
// already small and short, and kept whole, goes up as it is, with no loss and no waiting.
import { api } from './api.js'

export const MAX_VIDEO_SEC = 30
export const MIN_VIDEO_SEC = 1
export const MAX_VIDEO_BYTES = 3 * 1024 * 1024      // the server's limit (api/social.js)
const SAFE = 0.78                                    // aim under the limit: a recorder overshoots a little
const AUDIO_BPS = 64000
const SHORT_SIDE = 480
const LONG_SIDE = 854
const MAX_FILE = 600 * 1024 * 1024
const FPS = 30

/** The video bit rate (bits per second) that keeps `seconds` of video and sound under the limit. */
export function videoBitrateFor(seconds) {
  const s = Math.max(1, Number(seconds) || 0)
  const total = MAX_VIDEO_BYTES * SAFE * 8 / s
  return Math.round(Math.min(1_400_000, Math.max(250_000, total - AUDIO_BPS)))
}

/** The size a video of `w` x `h` is drawn at: 480 on the short side, 854 on the long, never larger, always even. */
export function sizeFor(w, h) {
  const a = Math.max(1, Number(w) || 0), b = Math.max(1, Number(h) || 0)
  const k = Math.min(1, SHORT_SIDE / Math.min(a, b), LONG_SIDE / Math.max(a, b))
  const even = n => Math.max(2, Math.round(n * k / 2) * 2)
  return { w: even(a), h: even(b) }
}

/** The best format this phone's recorder can write, or null: MP4 where it can, else WebM. */
export function pickMime(M = typeof MediaRecorder !== 'undefined' ? MediaRecorder : null) {
  if (!M || typeof M.isTypeSupported !== 'function') return null
  const list = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return list.find(m => { try { return M.isTypeSupported(m) } catch { return false } }) || null
}

const kindOfMime = m => (/mp4/i.test(m) ? 'video/mp4' : 'video/webm')

/**
 * Whether the file can go up untouched: an MP4 or WebM under the size limit, 30 seconds or less,
 * with the whole of it chosen.
 */
export function goesAsIs(file, duration, range) {
  if (!file || !/^video\/(mp4|webm)\b/i.test(file.type || '')) return false
  if (file.size > MAX_VIDEO_BYTES * 0.97) return false
  if (duration > MAX_VIDEO_SEC + 0.5) return false
  return range.start <= 0.05 && range.end >= duration - 0.05
}

/** The part to start from: the first MAX_VIDEO_SEC seconds, or all of a shorter video. */
export const defaultVideoRange = duration => ({ start: 0, end: Math.round(Math.min(Math.max(0, Number(duration) || 0), MAX_VIDEO_SEC) * 10) / 10 })

const fail = (code, message, cause) => Object.assign(new Error(message), { code, cause })

/**
 * A video file opened for choosing and cutting: { el, url, duration, width, height, dispose }.
 * Rejects with { code: 'video-file-large' | 'video-unreadable' }.
 */
export function openVideo(file) {
  if (!file) return Promise.reject(fail('video-none', 'no file'))
  if (file.size > MAX_FILE) return Promise.reject(fail('video-file-large', 'video file too large'))
  const url = URL.createObjectURL(file)
  const el = document.createElement('video')
  el.preload = 'auto'
  el.playsInline = true
  el.setAttribute('playsinline', '')
  el.src = url
  return new Promise((resolve, reject) => {
    const opened = { el, url, duration: 0, width: 0, height: 0, audio: null, dispose: null }
    const dispose = () => {
      try { el.pause(); el.removeAttribute('src'); el.load() } catch { /* gone */ }
      try { opened.audio?.ctx.close() } catch { /* closed */ }
      opened.audio = null
      URL.revokeObjectURL(url)
    }
    opened.dispose = dispose
    const timer = setTimeout(() => { dispose(); reject(fail('video-unreadable', 'the video did not load')) }, 20000)
    el.onloadedmetadata = () => {
      clearTimeout(timer)
      const duration = Number(el.duration)
      // A recording whose length is not in the header reads as Infinity until it is played to the end.
      if (!Number.isFinite(duration) || duration <= 0 || !el.videoWidth) { dispose(); reject(fail('video-unreadable', 'this file could not be read as a video')); return }
      Object.assign(opened, { duration, width: el.videoWidth, height: el.videoHeight })
      resolve(opened)
    }
    el.onerror = () => { clearTimeout(timer); dispose(); reject(fail('video-unreadable', 'this file could not be read as a video')) }
  })
}

const STALL_MS = 1500

// The sound of the opened video, routed to a stream for the recorder and not to the speakers. Made
// once per video and kept: a video element can be tied to an audio graph only once, and the second
// recording of a clip (made when the first came out too big) used to try again, fail, and play
// through a closed graph, where the video froze: the "stuck at 83%".
function soundOf(opened) {
  if (opened.audio !== null && opened.audio !== undefined) return opened.audio || null
  opened.audio = false
  try {
    const A = window.AudioContext || window.webkitAudioContext
    if (!A) return null
    const ctx = new A()
    const source = ctx.createMediaElementSource(opened.el)
    const dest = ctx.createMediaStreamDestination()
    source.connect(dest)
    opened.audio = { ctx, dest }
  } catch { /* a video without sound is still a video */ }
  return opened.audio || null
}

const seekTo = (el, t) => new Promise(resolve => {
  if (Math.abs(el.currentTime - t) < 0.01) { resolve(); return }
  const done = () => { el.removeEventListener('seeked', done); resolve() }
  el.addEventListener('seeked', done)
  el.currentTime = t
})

/**
 * Records `start`..`end` seconds of the opened video as a Blob, shrunk to fit. Real time:
 * `onProgress(0..1)` follows it. `shrink` (0..1) lowers the bit rate for a second try.
 */
export async function recordClip(opened, start, end, { onProgress, shrink = 1 } = {}) {
  const mime = pickMime()
  if (!mime || typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.captureStream) throw fail('video-unsupported', 'this phone cannot shrink a video')
  const seconds = Math.max(MIN_VIDEO_SEC, Math.min(MAX_VIDEO_SEC, end - start))
  const { el } = opened
  const size = sizeFor(opened.width, opened.height)
  const canvas = document.createElement('canvas')
  canvas.width = size.w; canvas.height = size.h
  const g = canvas.getContext('2d')
  const stream = canvas.captureStream(FPS)
  // The sound goes to the recorder only: the speakers stay quiet while the clip is being made.
  const audio = soundOf(opened)
  audio?.dest.stream.getAudioTracks().forEach(t => stream.addTrack(t.clone()))
  if (audio && audio.ctx.state === 'suspended') await audio.ctx.resume().catch(() => {})
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(videoBitrateFor(seconds) * shrink), audioBitsPerSecond: AUDIO_BPS })
  const chunks = []
  recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) }
  const stopped = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = e => reject(fail('video-failed', 'the recording failed', e?.error)) })
  const draw = () => { try { g.drawImage(el, 0, 0, size.w, size.h) } catch { /* a frame not ready yet */ } }
  try {
    el.muted = false
    await seekTo(el, start)
    draw()
    recorder.start(1000)
    await el.play()
    await new Promise((resolve, reject) => {
      const limit = setTimeout(() => { clearInterval(tick); reject(fail('video-failed', 'the clip took too long')) }, seconds * 1000 * 2 + 15000)
      // A big video from the phone's camera can stall while it is decoded (or the WebView pauses
      // it): the watch below nudges it on, instead of the old wait that ended the clip at the
      // first pause, or never.
      let last = el.currentTime, since = Date.now()
      const tick = setInterval(() => {
        draw()
        const at = el.currentTime
        onProgress?.(Math.max(0, Math.min(1, (at - start) / seconds)))
        if (at >= end - 0.03 || el.ended) { clearInterval(tick); clearTimeout(limit); resolve(); return }
        if (at > last + 0.001) { last = at; since = Date.now(); return }
        if (Date.now() - since > STALL_MS) { since = Date.now(); el.play().catch(() => {}) }
      }, 1000 / FPS)
    })
    el.pause()
    if (recorder.state !== 'inactive') recorder.stop()
    await stopped
  } finally {
    try { el.pause() } catch { /* gone */ }
    try { if (recorder.state !== 'inactive') recorder.stop() } catch { /* stopped */ }
    stream.getTracks().forEach(t => { try { t.stop() } catch { /* ended */ } })
  }
  if (!chunks.length) throw fail('video-failed', 'nothing was recorded')
  onProgress?.(1)
  return new Blob(chunks, { type: kindOfMime(mime) })
}

/**
 * The part of the opened video as a file ready to upload: the file itself when it can go as it is,
 * else a recording of the part; a recording that comes out over the limit is made once more at a
 * lower bit rate. Resolves { blob, secs }.
 */
export async function prepareVideo(file, opened, range, { onProgress } = {}) {
  const secs = Math.max(MIN_VIDEO_SEC, Math.min(MAX_VIDEO_SEC, Math.round(range.end - range.start)))
  if (goesAsIs(file, opened.duration, range)) { onProgress?.(1); return { blob: file, secs } }
  let blob = await recordClip(opened, range.start, range.end, { onProgress: p => onProgress?.(p * 0.9) })
  // Too big: once more at a lower bit rate. The bar starts over from where it stood, so it moves.
  if (blob.size > MAX_VIDEO_BYTES) blob = await recordClip(opened, range.start, range.end, { onProgress: p => onProgress?.(0.9 + p * 0.09), shrink: Math.min(0.55, MAX_VIDEO_BYTES * SAFE / blob.size) })
  if (blob.size > MAX_VIDEO_BYTES) throw fail('video-too-big', 'the clip is too big to share')
  return { blob, secs }
}

const toDataUrl = blob => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1] || '')
  r.onerror = () => reject(r.error)
  r.readAsDataURL(blob)
})

/** Uploads a prepared video; resolves with its id on the server. */
export async function uploadVideo(blob) {
  const b64 = await toDataUrl(blob)
  const mime = /mp4|quicktime/i.test(blob.type) ? 'video/mp4' : 'video/webm'
  const r = await api('/api/social/video', { method: 'POST', body: JSON.stringify({ data: `data:${mime};base64,${b64}` }) })
  return r.id
}
