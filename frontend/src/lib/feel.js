// Olympus: how you feel, one short check-in a day on the Body page (components/FeelCard.jsx):
// energy, sleep and soreness, each on a scale of 1 to 5. It is there so the page is about the
// whole body and how training sits with it, not about a number on the scale; it also tells the
// AI coach how recovered you are.
//
// Stored per day like a note on a day off (lib/day-notes.js):
//
//   S.feel = { '2026-10-26': { energy: 4, sleep: 3, soreness: 2, _ts }, … }
//
// Each day is one entry with the time it was last written, so two devices that each checked in on
// a different day keep both, and the same day keeps the later check-in (lib/sync-merge.js
// mergeStampedMap). Clearing a day is a stamped empty entry, never a deleted key.
import { todayISO, isoOf } from './format.js'

/** The three things asked, with the words at both ends of the scale (English source strings). */
export const FEEL_FIELDS = [
  { id: 'energy', name: 'Energy', icon: 'bolt', low: 'Low', high: 'High' },
  { id: 'sleep', name: 'Sleep', icon: 'moon', low: 'Poor', high: 'Great' },
  { id: 'soreness', name: 'Soreness', icon: 'figureStrength', low: 'None', high: 'Very sore' },
]
const IDS = FEEL_FIELDS.map(f => f.id)
const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/
const score = v => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : null)

/** A stored entry read back: { energy, sleep, soreness } (null where not answered), or null for none. */
export function readFeel(entry) {
  if (!isMap(entry)) return null
  const out = Object.fromEntries(IDS.map(id => [id, score(entry[id])]))
  return IDS.some(id => out[id] != null) ? out : null
}

/** The check-in of `iso` (today by default), or null. */
export const feelOn = (S, iso = todayISO()) => readFeel(isMap(S?.feel) ? S.feel[iso] : null)

/**
 * Sets `field` of day `iso` to `value` (1 to 5), or clears it when `value` is the one already
 * there, on the document `s` (inside a store update). Returns nothing.
 */
export function setFeel(s, iso, field, value, now = Date.now()) {
  if (!ISO.test(iso) || !IDS.includes(field)) return
  if (!isMap(s.feel)) s.feel = {}
  const cur = readFeel(s.feel[iso]) || {}
  const next = { ...cur, [field]: cur[field] === value ? null : score(value) }
  const kept = Object.fromEntries(IDS.filter(id => next[id] != null).map(id => [id, next[id]]))
  s.feel[iso] = { ...kept, _ts: now }
}

/** The last `days` days, oldest first: [{ iso, feel }] (feel null for a day without a check-in). */
export function recentFeel(S, days = 14, today = todayISO()) {
  const out = []
  const d = new Date(today + 'T12:00:00')
  d.setDate(d.getDate() - (days - 1))
  for (let i = 0; i < days; i++) {
    const iso = isoOf(d)
    out.push({ iso, feel: feelOn(S, iso) })
    d.setDate(d.getDate() + 1)
  }
  return out
}

/** One line for the AI coach about the last week's check-ins, or '' when there are none. */
export function feelSummary(S, today = todayISO()) {
  const week = recentFeel(S, 7, today).map(x => x.feel).filter(Boolean)
  if (!week.length) return ''
  const avg = id => {
    const v = week.map(f => f[id]).filter(x => x != null)
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null
  }
  const parts = FEEL_FIELDS.map(f => [f.id, avg(f.id)]).filter(([, v]) => v != null).map(([id, v]) => `${id} ${v}/5`)
  const t = feelOn(S, today)
  const todayPart = t ? '; today ' + FEEL_FIELDS.filter(f => t[f.id] != null).map(f => `${f.id} ${t[f.id]}/5`).join(', ') : ''
  return `How they felt over the last 7 days (${week.length} check-ins, 1 low to 5 high; soreness 5 = very sore): ${parts.join(', ')}${todayPart}.`
}
