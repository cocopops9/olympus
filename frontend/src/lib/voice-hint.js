// The words a person is likely to say to a coach, from their own data: the exercises of the workout
// in progress (the one on now first), of their routines, and of their latest sessions. Sent with
// every recording (lib/voice.js) so the transcription and its correction (api/voice.js) prefer
// "full squats" to "pull up squats" when the audio is unclear.
import { EXIDX } from './exercises.js'
import { exerciseNameFor } from './i18n-core.js'

const nameOf = id => (EXIDX[id] ? exerciseNameFor(EXIDX[id]) : /^[a-z0-9_]+$/.test(String(id)) ? '' : String(id))

/** Up to `max` distinct exercise names, most relevant first, as a comma-separated string. */
export function voiceHint(S, max = 24) {
  const seen = new Set(), out = []
  const add = id => {
    const n = nameOf(id)
    if (n && !seen.has(n) && out.length < max) { seen.add(n); out.push(n) }
  }
  try {
    const A = S?.active
    const entries = A?.entries || []
    if (entries[A?.cur]) add(entries[A.cur].id)
    entries.forEach(e => add(e?.id))
    ;(S?.routines || []).slice(0, 6).forEach(r => (r?.ex || []).forEach(e => add(e?.id)))
    ;[...(S?.workouts || [])].slice(-6).reverse().forEach(w => (w?.entries || w?.ex || []).forEach(e => add(e?.id)))
  } catch { /* a hint is only a help */ }
  return out.join(', ')
}
