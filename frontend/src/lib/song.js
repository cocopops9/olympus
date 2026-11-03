// Olympus: the song of a workout post. The person picks the part to share, from a few seconds to
// the whole song. A song picked on the phone is too big to post as it is (a few megabytes, and a
// post's song is a mood, not an album), so the app cuts the part chosen, mixes it to mono, brings
// it down to 24 or 32 thousand samples a second and encodes it as an MP3 (about 8 KB a second at
// 64 kbit/s). The bit rate falls with the length so that the file never passes MAX_BYTES, even for
// MAX_SONG_SEC seconds, which is what the server stores beside the post's photos (api/social.js
// uploadSong). The phone decodes any format its WebView can play (MP3, AAC/M4A, OGG, WAV, FLAC).
// The clip fades in and out so it does not start or stop on a click. The encoder (lamejs) is
// loaded only when a clip is encoded.
import { api } from './api.js'

export const CLIP_SEC = 30          // the length a clip starts with
export const MIN_CLIP_SEC = 3
export const MAX_SONG_SEC = 360     // six minutes: the longest part that can be shared
export const MAX_BYTES = 2_400_000  // under the server's limit (2.6 MB), with room for the tags
export const RATE = 22050           // the WAV of earlier versions
const FADE_SEC = 0.6
const MAX_FILE = 40 * 1024 * 1024
const BITRATES = [128, 96, 80, 64, 56, 48]

const Ctx = () => (typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null)

/** The whole song decoded: { buffer (AudioBuffer), duration (s) }. Rejects with { code }. */
export async function decodeSong(file) {
  if (!file) throw Object.assign(new Error('no file'), { code: 'song-none' })
  if (file.size > MAX_FILE) throw Object.assign(new Error('song file too large'), { code: 'song-file-large' })
  const C = Ctx()
  if (!C) throw Object.assign(new Error('no audio here'), { code: 'song-unsupported' })
  const ctx = new C()
  try {
    const bytes = await file.arrayBuffer()
    const buffer = await new Promise((resolve, reject) => {
      // Older WebViews only have the callback form.
      const p = ctx.decodeAudioData(bytes, resolve, reject)
      if (p && typeof p.then === 'function') p.then(resolve, reject)
    })
    return { buffer, duration: buffer.duration }
  } catch (e) {
    throw Object.assign(new Error('this file could not be read as audio'), { code: 'song-unreadable', cause: e })
  } finally {
    try { await ctx.close() } catch { /* already closed */ }
  }
}

/* ------------------------------ the part to share ------------------------------ */

const sec = n => Math.round((Number(n) || 0) * 10) / 10

/** The longest part of a song of `duration` seconds that can be shared. */
export const longest = duration => Math.min(Math.max(0, Number(duration) || 0), MAX_SONG_SEC)

/** The part of the song that starts selected: CLIP_SEC seconds from a third of the way in. */
export function defaultRange(duration) {
  const d = Math.max(0, Number(duration) || 0)
  const len = Math.min(CLIP_SEC, longest(d))
  const start = Math.min(Math.max(0, Math.floor(d - len)), Math.round(d / 3))
  return { start, end: sec(start + len) }
}

/** The whole song, or its first MAX_SONG_SEC seconds when it is longer. */
export const wholeRange = duration => ({ start: 0, end: sec(longest(duration)) })

/**
 * A range kept in bounds: inside the song, at least MIN_CLIP_SEC and at most MAX_SONG_SEC long.
 * `moved` is the end that was dragged ('start' or 'end'); the other one gives way when needed.
 * `minLen` and `maxLen` (seconds) default to a song's; a short video passes its own.
 */
export function clampRange(duration, { start, end }, moved = 'end', { minLen = MIN_CLIP_SEC, maxLen = MAX_SONG_SEC } = {}) {
  const d = Math.max(0, Number(duration) || 0)
  const min = Math.min(minLen, d)
  let s = Math.min(Math.max(0, Number(start) || 0), d)
  let e = Math.min(Math.max(0, Number(end) || 0), d)
  if (moved === 'start') {
    s = Math.min(s, Math.max(0, e - min))
    if (e - s > maxLen) e = s + maxLen
  } else {
    e = Math.max(e, Math.min(d, s + min))
    if (e - s > maxLen) s = e - maxLen
  }
  return { start: sec(s), end: sec(e) }
}

/* ---------------------------------- the clip ---------------------------------- */

/** Where the clip starts in the buffer and how many samples it has at `rate`. */
function planOf(buffer, start, seconds, rate) {
  const src = buffer.sampleRate
  const from = Math.max(0, Math.min(Math.floor(start * src), buffer.length - 1))
  const n = Math.max(1, Math.min(Math.floor(seconds * src), buffer.length - from))
  const outLen = Math.max(1, Math.floor(n * rate / src))
  return { from, n, outLen, step: src / rate }
}

/** Sample `i` of the clip as mono (the channels averaged), by linear interpolation. */
function monoAt(chans, plan, i) {
  const x = plan.from + i * plan.step
  const a = Math.floor(x), f = x - a
  const b = Math.min(a + 1, plan.from + plan.n - 1)
  let v = 0
  for (const ch of chans) v += ch[a] * (1 - f) + ch[b] * f
  return v / chans.length
}

const fadeOf = (outLen, rate) => Math.min(Math.floor(FADE_SEC * rate), Math.floor(outLen / 2))
const gainAt = (i, outLen, fade) => (i < fade ? i / fade : i >= outLen - fade ? (outLen - 1 - i) / fade : 1)

/**
 * The clip as mono samples at `rate`: `seconds` from `start` (fewer for a shorter song), mixed
 * down by averaging the channels, resampled linearly, faded at both ends. A Float32Array.
 */
export function clipSamples(buffer, start, { seconds = CLIP_SEC, rate = RATE } = {}) {
  const plan = planOf(buffer, start, seconds, rate)
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  const out = new Float32Array(plan.outLen)
  for (let i = 0; i < plan.outLen; i++) out[i] = monoAt(chans, plan, i)
  const fade = fadeOf(plan.outLen, rate)
  for (let i = 0; i < fade; i++) { const k = i / fade; out[i] *= k; out[plan.outLen - 1 - i] *= k }
  return out
}

/** 16-bit PCM WAV bytes of mono `samples` at `rate`. */
export function wavBytes(samples, rate = RATE) {
  const data = samples.length * 2
  const buf = new ArrayBuffer(44 + data)
  const v = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + data, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, data, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Uint8Array(buf)
}

/** The highest bit rate (kbit/s) at which `seconds` of mono audio stay under MAX_BYTES. */
export function bitrateFor(seconds) {
  const s = Math.max(1, Number(seconds) || 0)
  return BITRATES.find(k => s * k * 125 <= MAX_BYTES) || BITRATES[BITRATES.length - 1]
}

/** The sample rate the encoder runs at for a bit rate: 32 kHz from 64 kbit/s up, 24 kHz below. */
export const rateFor = kbps => (kbps >= 64 ? 32000 : 24000)

const pause = () => new Promise(resolve => setTimeout(resolve, 0))

/**
 * The part of `buffer` from `start` to `end` seconds, encoded as an MP3 (Uint8Array). Works in
 * blocks and lets the screen breathe between them; `onProgress(0..1)` follows it.
 */
export async function encodeMp3(buffer, start, end, { onProgress } = {}) {
  const seconds = Math.max(MIN_CLIP_SEC, Math.min(MAX_SONG_SEC, (Number(end) || 0) - (Number(start) || 0)))
  const kbps = bitrateFor(seconds)
  const rate = rateFor(kbps)
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const enc = new Mp3Encoder(1, rate, kbps)
  const plan = planOf(buffer, start, seconds, rate)
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  const fade = fadeOf(plan.outLen, rate)
  const block = 1152 * 16
  const pcm = new Int16Array(block)
  const parts = []
  let size = 0
  for (let at = 0; at < plan.outLen; at += block) {
    const len = Math.min(block, plan.outLen - at)
    for (let j = 0; j < len; j++) {
      const i = at + j
      const v = Math.max(-1, Math.min(1, monoAt(chans, plan, i) * gainAt(i, plan.outLen, fade)))
      pcm[j] = v < 0 ? v * 0x8000 : v * 0x7fff
    }
    const out = enc.encodeBuffer(len === block ? pcm : pcm.subarray(0, len))
    if (out.length) { parts.push(out); size += out.length }
    onProgress?.(Math.min(1, (at + len) / plan.outLen))
    await pause()
  }
  const tail = enc.flush()
  if (tail.length) { parts.push(tail); size += tail.length }
  const bytes = new Uint8Array(size)
  let o = 0
  for (const p of parts) { bytes.set(p, o); o += p.length }
  return bytes
}

const toBase64 = bytes => {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Encodes the part of `buffer` from `start` to `end` and uploads it; resolves with its id on the server. */
export async function uploadSong(buffer, start, end, { onProgress } = {}) {
  const bytes = await encodeMp3(buffer, start, end, { onProgress })
  const data = 'data:audio/mpeg;base64,' + toBase64(bytes)
  const r = await api('/api/social/song', { method: 'POST', body: JSON.stringify({ data }) })
  return r.id
}

/**
 * Plays the part of `buffer` from `start` to `end` as it is, with no encoding, so the person hears
 * the choice at once. Returns { stop, done }: `done` resolves when it ends or is stopped.
 */
export function previewRange(buffer, start, end) {
  const C = Ctx()
  if (!C) return { stop() {}, done: Promise.resolve() }
  const ctx = new C()
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const gain = ctx.createGain()
  src.connect(gain); gain.connect(ctx.destination)
  let over = false
  let resolveDone
  const done = new Promise(resolve => { resolveDone = resolve })
  const finish = () => {
    if (over) return
    over = true
    try { src.disconnect() } catch { /* gone */ }
    ctx.close().catch(() => {})
    resolveDone()
  }
  src.onended = finish
  const len = Math.max(0.1, end - start)
  const fade = Math.min(0.3, len / 4)
  const t0 = ctx.currentTime
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(1, t0 + fade)
  gain.gain.setValueAtTime(1, t0 + len - fade)
  gain.gain.linearRampToValueAtTime(0, t0 + len)
  src.start(0, start, len)
  return { stop() { try { src.stop() } catch { /* not started */ } finish() }, done }
}

/** A title from the file's name: "02 - Eye of the Tiger.mp3" reads "Eye of the Tiger". */
export function titleFromFile(name) {
  return String(name || '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/^\s*\d{1,3}\s*[-._ ]\s*/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}
