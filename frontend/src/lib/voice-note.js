// Olympus: recording a voice message for a conversation (views/Chats.jsx). Its own microphone,
// opened when recording starts and closed the moment it stops, so the phone never stays in "call"
// mode afterwards (the coaches' voice mode keeps its own, lib/voice.js).
//
// startVoiceNote() resolves to { stop, cancel, level }:
//   stop()   -> Promise<{ blob, secs }>, the recording (or null when it was too short to keep)
//   cancel() -> nothing kept
//   level()  -> how loud it is now, 0..1, for the bars on screen
// It stops by itself at VOICE_NOTE.maxSecs, and `onLimit` is told.
import { audioNormal } from './local-voice.js'

export const VOICE_NOTE = Object.freeze({ maxSecs: 300, minMs: 700, bitrate: 32000 })
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']

export const canRecordNote = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  && typeof window !== 'undefined' && typeof window.MediaRecorder === 'function'

export async function startVoiceNote({ onLimit } = {}) {
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
  } catch (e) {
    throw Object.assign(new Error(e?.name || 'unavailable'), { code: e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'permission' : 'unavailable' })
  }
  const type = TYPES.find(m => window.MediaRecorder.isTypeSupported?.(m)) || ''
  let rec
  try { rec = new window.MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: VOICE_NOTE.bitrate } : undefined) } catch {
    stream.getTracks().forEach(x => x.stop())
    throw Object.assign(new Error('unavailable'), { code: 'unavailable' })
  }
  const chunks = []
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) }
  // The loudness, for the bars: an analyser on the same stream, closed with it.
  let ac = null, analyser = null, buf = null
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    ac = new AC()
    analyser = ac.createAnalyser()
    analyser.fftSize = 512
    buf = new Float32Array(analyser.fftSize)
    ac.createMediaStreamSource(stream).connect(analyser)
  } catch { analyser = null }
  const t0 = Date.now()
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    clearTimeout(limit)
    stream.getTracks().forEach(x => x.stop())
    try { ac?.close() } catch { /* closed */ }
    audioNormal()   // the phone's audio out of call mode at once (lib/local-voice.js)
  }
  const finished = new Promise(resolve => { rec.onstop = () => { close(); resolve() } })
  const end = () => { if (rec.state !== 'inactive') { try { rec.stop() } catch { close() } } else close() }
  const limit = setTimeout(() => { end(); onLimit?.() }, VOICE_NOTE.maxSecs * 1000)
  rec.start(500)
  return {
    async stop() {
      const ms = Date.now() - t0
      end()
      await Promise.race([finished, new Promise(r => setTimeout(r, 1500))])
      close()
      if (ms < VOICE_NOTE.minMs || !chunks.length) return null
      return { blob: new Blob(chunks, { type: (rec.mimeType || type || 'audio/webm').split(';')[0] }), secs: Math.min(VOICE_NOTE.maxSecs, Math.max(1, Math.round(ms / 1000))) }
    },
    cancel() { chunks.length = 0; end(); close() },
    level() {
      if (!analyser || closed) return 0
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      return Math.min(1, Math.sqrt(sum / buf.length) * 6)
    },
    elapsed: () => Date.now() - t0,
  }
}

/** A blob as a data URL, the way the server takes attachments. */
export const blobToDataUrl = blob => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result))
  r.onerror = () => reject(r.error || new Error('could not read the file'))
  r.readAsDataURL(blob)
})

/** "0:07", "1:42": a voice message's length. */
export const fmtSecs = s => { const n = Math.max(0, Math.round(s || 0)); return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0') }

/** "820 KB", "2.4 MB": a file's size. */
export const fmtBytes = n => (n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1024 / 1024).toFixed(1) + ' MB')
