// Olympus: a stopwatch on a cardio or sport row (a run, a match, a swim). Started from the row, it
// counts up from the tap; stopped, the time it shows becomes the row's duration (set.min, in
// minutes as lib/cardio-time.js stores it) and the row is ticked. It is optional: a row nobody
// starts is typed as it always was.
//
// The running stopwatch lives on the row of the session in progress as `swAt`, the wall-clock
// time it was started (ms), so it survives a reload or the app going to the background. It is
// bookkeeping of the live session and never reaches a saved workout (lib/finish-workout.js).
// It counts wall-clock time: pausing the workout clock does not hold it, because the run or the
// match goes on.
import { CARDIO_MAX_SEC, minOfSecs } from './cardio-time.js'

/** True while the row's stopwatch is running. */
export const stopwatchRunning = row => Number.isFinite(row?.swAt)

/** Whole seconds on the row's stopwatch at `now`; 0 when it is not running. At most a day. */
export function stopwatchSec(row, now = Date.now()) {
  if (!stopwatchRunning(row)) return 0
  return Math.min(CARDIO_MAX_SEC, Math.max(0, Math.floor((now - row.swAt) / 1000)))
}

/** The row with its stopwatch started at `now`; the same row when it is done or already running. */
export function startStopwatch(row, now = Date.now()) {
  if (!row || row.done || stopwatchRunning(row)) return row
  return { ...row, swAt: now }
}

/**
 * The row with its stopwatch stopped: its duration is the time counted, the stopwatch gone. A row
 * whose stopwatch is not running comes back as it was.
 */
export function stopStopwatch(row, now = Date.now()) {
  if (!stopwatchRunning(row)) return row
  const { swAt, ...rest } = row
  return { ...rest, min: minOfSecs(stopwatchSec(row, now)) }
}

/** The row without a stopwatch, as a saved workout keeps it. */
export function withoutStopwatch(row) {
  if (!row || !('swAt' in row)) return row
  const { swAt, ...rest } = row
  return rest
}
