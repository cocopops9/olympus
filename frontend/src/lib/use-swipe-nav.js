import { useRef } from 'react'

// A sideways swipe that pages through periods: a month, a week, a year. The finger drags the page
// the way a calendar turns, so moving it toward the end of the line (right in a left-to-right
// language) brings back the previous period and toward the start the next one; in a right-to-left
// language the two swap, as the arrows do.
//
// Only the end of the touch is judged, the way Profile's week has always done it: the swipe must go
// SWIPE_MIN px sideways and be clearly sideways (SWIPE_RATIO times more x than y), so a page scroll
// that drifts a little never turns the period. Touches that start within EDGE px of either screen
// edge are left to the system's back gesture, and an element marked data-swipe-ignore (a strip that
// scrolls sideways on its own) keeps its own gesture.

export const SWIPE_MIN = 50
export const SWIPE_RATIO = 1.5
export const EDGE = 24

/**
 * Which way a finished touch turns the period.
 * @param {number} dx Horizontal travel in px, positive to the right.
 * @param {number} dy Vertical travel in px.
 * @param {boolean} rtl Whether the page reads right to left.
 * @returns {-1|0|1} -1 for the previous period, 1 for the next, 0 for no swipe.
 */
export function swipeStep(dx, dy, rtl = false) {
  if (!(Math.abs(dx) >= SWIPE_MIN) || Math.abs(dx) < SWIPE_RATIO * Math.abs(dy)) return 0
  const towardEnd = rtl ? dx < 0 : dx > 0
  return towardEnd ? -1 : 1
}

const isRtl = () => typeof document !== 'undefined' && document.documentElement.dir === 'rtl'

/**
 * Touch handlers to spread onto the element that should page on a swipe.
 * @param {{ onPrev?: () => void, onNext?: () => void }} handlers Either may be left out, or be
 *   undefined while that way is closed (the next period after today).
 */
export function useSwipeNav({ onPrev, onNext }) {
  const start = useRef(null)
  const handlers = useRef({ onPrev, onNext })
  handlers.current = { onPrev, onNext }
  const onTouchStart = e => {
    const touch = e.touches?.[0]
    const width = typeof window !== 'undefined' ? window.innerWidth : Infinity
    const ignored = e.target?.closest?.('[data-swipe-ignore]')
    start.current = !touch || e.touches.length > 1 || ignored || touch.clientX < EDGE || touch.clientX > width - EDGE
      ? null : { x: touch.clientX, y: touch.clientY }
  }
  const onTouchEnd = e => {
    const a = start.current, b = e.changedTouches?.[0]
    start.current = null
    if (!a || !b) return
    const step = swipeStep(b.clientX - a.x, b.clientY - a.y, isRtl())
    if (step < 0) handlers.current.onPrev?.()
    else if (step > 0) handlers.current.onNext?.()
  }
  const onTouchCancel = () => { start.current = null }
  return { onTouchStart, onTouchEnd, onTouchCancel }
}
