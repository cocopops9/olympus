// A cardio set's duration is stored as minutes (set.min, target.min), a decimal when it is not a
// whole number: 30 min 16 s is 30.2667. These helpers move between that number and the
// hours / minutes / seconds a person types and reads. Plain JS with no i18n, so the Node-side
// code (mcp/) can import it through lib/history.js.

// Longest a single cardio entry can be: a day.
export const CARDIO_MAX_SEC = 24 * 3600 - 1

/** Whole seconds in a number of minutes: 30.2667 → 1816. */
export const secsOfMin = min => Math.max(0, Math.round((Number(min) || 0) * 60))

/** Minutes from whole seconds, kept to four decimals so 16 s survives the round trip. */
export const minOfSecs = sec => Math.round(Math.max(0, Math.round(Number(sec) || 0)) / 60 * 10000) / 10000

/** { h, m, s } for a number of seconds: 5416 → { h: 1, m: 30, s: 16 }. */
export function splitHms(sec) {
  const n = Math.max(0, Math.round(Number(sec)) || 0)
  return { h: Math.floor(n / 3600), m: Math.floor((n % 3600) / 60), s: n % 60 }
}

/** Hours, minutes and seconds typed in any mix (90 minutes, 75 seconds) back to whole seconds. */
export const joinHms = (h, m, s) => Math.min(CARDIO_MAX_SEC, Math.max(0, Math.round((Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0))))

/** True when the minutes carry no loose seconds: 30, 90, 0.5 is not. */
export const isWholeMinutes = min => secsOfMin(min) % 60 === 0

const pad2 = n => String(n).padStart(2, '0')

/**
 * The clock a duration reads as: "30:16", "1:30:16". Under an hour the minutes are not padded
 * ("5:00"), from an hour up everything is ("1:05:00").
 */
export function fmtClock(min) {
  const { h, m, s } = splitHms(secsOfMin(min))
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`
}

/**
 * A cardio duration for a plan or history line. Whole minutes stay "30 min", as they always read;
 * anything with seconds in it reads as a clock ("30:16 min", "1:30:16"), so the seconds are seen.
 */
export const fmtCardioMin = min => (isWholeMinutes(min) ? `${Number(min) || 0} min` : secsOfMin(min) >= 3600 ? fmtClock(min) : `${fmtClock(min)} min`)
