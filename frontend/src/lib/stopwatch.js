// Olympus: a stopwatch on a cardio or sport row (a run, a match, a swim). Started from the row, it
// counts up from the tap; it can be paused and resumed as often as needed (a break in the match,
// a red light on the run) without losing what it has counted. Ticked, the time it shows becomes
// the row's duration (set.min, in minutes as lib/cardio-time.js stores it). It is optional: a row
// nobody starts is typed as it always was.
//
// The stopwatch lives on the row of the session in progress as two fields:
//   swAt   the wall-clock time (ms) the current running stretch began; absent while paused;
//   swAcc  the milliseconds counted by earlier stretches, before the last pause; absent until
//          the first pause.
// Running is `swAt` present; paused is `swAcc` present without `swAt`. Both are wall-clock based,
// so the count survives a reload or the app going to the background. They are bookkeeping of the
// live session and never reach a saved workout (lib/finish-workout.js). Pausing the workout clock
// does not hold the stopwatch, because the run or the match goes on: only its own pause does.
import { CARDIO_MAX_SEC, minOfSecs } from './cardio-time.js'

const accOf = row => (Number.isFinite(row?.swAcc) ? Math.max(0, row.swAcc) : 0)

/** True while the row's stopwatch is counting. */
export const stopwatchRunning = row => Number.isFinite(row?.swAt)

/** True while the row's stopwatch is paused: it holds a count but is not counting. */
export const stopwatchPaused = row => !stopwatchRunning(row) && Number.isFinite(row?.swAcc)

/** True when the row's stopwatch was started and not yet stopped, running or paused. */
export const stopwatchActive = row => stopwatchRunning(row) || stopwatchPaused(row)

/** Whole seconds on the row's stopwatch at `now`; 0 when it was never started. At most a day. */
export function stopwatchSec(row, now = Date.now()) {
  if (!stopwatchActive(row)) return 0
  const live = stopwatchRunning(row) ? Math.max(0, now - row.swAt) : 0
  return Math.min(CARDIO_MAX_SEC, Math.floor((accOf(row) + live) / 1000))
}

/**
 * The row with its stopwatch counting from `now`: a fresh start, or a resume that keeps what a
 * paused stopwatch held. The same row when it is ticked or already running.
 */
export function startStopwatch(row, now = Date.now()) {
  if (!row || row.done || stopwatchRunning(row)) return row
  return { ...row, swAt: now }
}

/** The row with its stopwatch paused at `now`, its count kept; the same row when not running. */
export function pauseStopwatch(row, now = Date.now()) {
  if (!stopwatchRunning(row)) return row
  const { swAt, ...rest } = row
  return { ...rest, swAcc: accOf(row) + Math.max(0, now - swAt) }
}

/**
 * The row with its stopwatch stopped: its duration is the time counted, the stopwatch gone. A
 * paused stopwatch stops at the count it holds. A row with no stopwatch comes back as it was.
 */
export function stopStopwatch(row, now = Date.now()) {
  if (!stopwatchActive(row)) return row
  return { ...withoutStopwatch(row), min: minOfSecs(stopwatchSec(row, now)) }
}

/** The row without a stopwatch, as a saved workout keeps it. */
export function withoutStopwatch(row) {
  if (!row || !('swAt' in row || 'swAcc' in row)) return row
  const { swAt, swAcc, ...rest } = row
  return rest
}
