import { useEffect, useState } from 'react'
import { elapsedOf, fmtClock, isPaused } from '../lib/workout-clock.js'

// A session's trained time, "12:34" (lib/workout-clock.js: pauses left out). Its own little
// component so the only thing that re-renders every second is this text: the workout header and
// the tab bar's Resume button both show it. `active` is the session; `start` alone still works
// for a clock without pauses. Paused, it stands still and blinks softly.
export default function Elapsed({ active, start }) {
  const a = active || { start }
  const paused = isPaused(a)
  const [text, setText] = useState(() => fmtClock(elapsedOf(a)))
  useEffect(() => {
    const tick = () => setText(fmtClock(elapsedOf(a)))
    tick()
    if (paused) return undefined
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [a.start, a.pausedAt, a.pausedMs, paused])
  return <span className={paused ? 'clock-paused' : undefined}>{text}</span>
}
