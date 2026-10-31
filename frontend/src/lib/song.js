// Olympus: the song of a workout post. A song picked on the phone is too big to post whole (a few
// megabytes, and a post's song is a mood, not an album), so the app cuts a clip of it, CLIP_SEC
// seconds from where the person chooses, mixes it to mono, brings it down to RATE samples a
// second and encodes it as a WAV: about 1.3 MB for 30 seconds, which the server stores beside
// the post's photos (api/social.js uploadSong). The phone decodes any format its WebView can play
// (MP3, AAC/M4A, OGG, WAV, FLAC). The clip fades in and out so it does not start or stop on a click.
import { api } from './api.js'

export const CLIP_SEC = 30
export const RATE = 22050
const FADE_SEC = 0.6
const MAX_FILE = 40 * 1024 * 1024

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

/** Where a clip may start, in whole seconds: 0 up to the song's length less the clip. */
export const clipStartMax = duration => Math.max(0, Math.floor((Number(duration) || 0) - CLIP_SEC))

/** A good place to start: a third of the way in, where most songs are past their intro. */
export const defaultStart = duration => Math.min(clipStartMax(duration), Math.round((Number(duration) || 0) / 3))

/**
 * The clip as mono samples at `rate`: CLIP_SEC seconds from `start` (fewer for a shorter song),
 * mixed down by averaging the channels, resampled linearly, faded at both ends. A Float32Array.
 */
export function clipSamples(buffer, start, { seconds = CLIP_SEC, rate = RATE } = {}) {
  const src = buffer.sampleRate
  const from = Math.max(0, Math.min(Math.floor(start * src), buffer.length - 1))
  const n = Math.max(1, Math.min(Math.floor(seconds * src), buffer.length - from))
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  const outLen = Math.max(1, Math.floor(n * rate / src))
  const out = new Float32Array(outLen)
  const step = src / rate
  for (let i = 0; i < outLen; i++) {
    const x = from + i * step
    const a = Math.floor(x), f = x - a
    const b = Math.min(a + 1, from + n - 1)
    let v = 0
    for (const ch of chans) v += ch[a] * (1 - f) + ch[b] * f
    out[i] = v / chans.length
  }
  const fade = Math.min(Math.floor(FADE_SEC * rate), Math.floor(outLen / 2))
  for (let i = 0; i < fade; i++) { const k = i / fade; out[i] *= k; out[outLen - 1 - i] *= k }
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

const toBase64 = bytes => {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** The clip of `buffer` from `start`, as a WAV Blob (to listen to before posting). */
export const clipBlob = (buffer, start) => new Blob([wavBytes(clipSamples(buffer, start))], { type: 'audio/wav' })

/** Uploads the clip of `buffer` from `start`; resolves with its id on the server. */
export function uploadSong(buffer, start) {
  const data = 'data:audio/wav;base64,' + toBase64(wavBytes(clipSamples(buffer, start)))
  return api('/api/social/song', { method: 'POST', body: JSON.stringify({ data }) }).then(r => r.id)
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
