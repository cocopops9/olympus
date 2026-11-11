// Interval cardio: a run (or a bike, a row) planned as segments, each with its own length,
// speed and the rest after it. "1 min at 12 km/h, 30 s at 17.5 km/h, repeated for 7 minutes,
// 7 minutes off, the same again" is 18 segments; the session builds one cardio row per segment,
// each row is started like a timed hold (the countdown beeps at its end, the moment to change
// the speed), and a segment with no rest after it starts the next one by itself.
//
// `cfg.intervals`: [{ min, speed, rest }], `min` in minutes (0.25 steps, so 30 s is 0.5),
// `speed` in km/h like every stored speed (lib/speed.js), `rest` the seconds after the segment,
// 0 for going straight on. Written only on a cardio exercise that has segments; a plain cardio
// config (sets, min, speed) is what it always was.
// Imports nothing from history.js, which imports this module.
import { isWarmupRow } from './workout-model.js'

export const MAX_INTERVALS = 40
const MIN_STEP = 0.25

const num = (v, lo, hi) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo
}

/** The segments a plan or an editor holds, kept to what a session can run. */
export function normalizeIntervals(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const v of list) {
    if (!v || typeof v !== 'object') continue
    const min = Math.round(num(v.min, 0, 180) / MIN_STEP) * MIN_STEP
    if (!(min > 0)) continue
    out.push({ min, speed: Math.round(num(v.speed, 0, 40) * 10) / 10, rest: Math.round(num(v.rest, 0, 1800)) })
  }
  return out.slice(0, MAX_INTERVALS)
}

export function isIntervals(cfg) {
  return !!cfg && Array.isArray(cfg.intervals) && cfg.intervals.length > 0
}

/** The rows a session starts with: one per segment, at its length and speed. */
export function intervalRows(cfg) {
  return normalizeIntervals(cfg.intervals).map(iv => ({ min: iv.min, speed: iv.speed, done: false }))
}

/**
 * The rest after the ticked row `i` of an interval exercise, in seconds (0: none, the next
 * segment follows), or null when the exercise has no segments. A row added in the session
 * past the plan rests like the last segment.
 */
export function intervalRestFor(target, rows, i) {
  if (!isIntervals(target)) return null
  const row = rows?.[i]
  if (!row || isWarmupRow(row)) return null
  const k = rows.slice(0, i).filter(r => !isWarmupRow(r)).length
  const list = target.intervals
  return Math.max(0, Number(list[Math.min(k, list.length - 1)]?.rest) || 0)
}

/** Minutes of running in the segments, rests left out. */
export const intervalMinutes = list => (list || []).reduce((sum, iv) => sum + (Number(iv.min) || 0), 0)

/** "1:00", "0:30", "7:00": a segment's length as a clock reads it. */
export function fmtMinutes(min) {
  const s = Math.round((Number(min) || 0) * 60)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
