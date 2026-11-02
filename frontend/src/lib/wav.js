// Olympus: the microphone's samples as a WAV clip. The recorder keeps the raw samples the browser
// hands over (floating point, at the sound card's rate, usually 48 kHz); the recognisers want 16 kHz
// 16-bit mono, which is also what carries speech without the losses of a compressed format.

/** One array out of the chunks the microphone delivered. */
export function joinChunks(chunks) {
  let n = 0
  for (const c of chunks) n += c.length
  const out = new Float32Array(n)
  let at = 0
  for (const c of chunks) { out.set(c, at); at += c.length }
  return out
}

/** `samples` at `from` Hz as samples at `to` Hz: each new sample is the mean of the old ones it covers. */
export function resample(samples, from, to) {
  if (!samples.length || from === to) return samples
  const ratio = from / to
  const n = Math.floor(samples.length / ratio)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio)
    const b = Math.max(a + 1, Math.min(samples.length, Math.floor((i + 1) * ratio)))
    let sum = 0
    for (let k = a; k < b; k++) sum += samples[k]
    out[i] = sum / (b - a)
  }
  return out
}

/** Quiet speech made louder, never noise made deafening: the loudest sample reaches `target` at most `maxGain` times up. */
export function levelled(samples, target = 0.7, maxGain = 6) {
  let peak = 0
  for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); if (a > peak) peak = a }
  if (peak < 0.01 || peak >= target) return samples
  const g = Math.min(maxGain, target / peak)
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * g
  return out
}

/** A WAV file (16-bit, mono) of `samples` at `rate` Hz. */
export function wavOf(samples, rate = 16000) {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

/** The clip as WAV: joined, trimmed to `headMs` before `fromMs` and `tailMs` after `toMs` (from the start of the recording), levelled, at 16 kHz. */
export function clipOf(chunks, rate, { fromMs = 0, toMs = Infinity, headMs = 600, tailMs = 900 } = {}) {
  const all = joinChunks(chunks)
  if (!all.length) return null
  const at = ms => Math.round(ms * rate / 1000)
  const a = Math.max(0, Math.min(all.length, at(fromMs - headMs)))
  const b = Math.max(a, Math.min(all.length, at(toMs + tailMs)))
  const part = all.subarray(a, b)
  if (part.length < rate * 0.3) return null
  return wavOf(levelled(resample(part, rate, 16000)), 16000)
}
