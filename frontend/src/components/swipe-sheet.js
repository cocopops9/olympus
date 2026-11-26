// Olympus: dragging a small chat window (a sheet) up makes it full screen, the way dragging the
// full screen down (views/CoachAI.jsx) makes it small again. Shared by the coaches' chat
// (components/Hercules.jsx) and Calliope's (components/Calliope.jsx).
//
// `zones`: { skip, list, handle } CSS selectors. A pull never starts on `skip` (the text box, the
// pills); on `list` (the conversation) only while it has nothing to scroll; on `handle` (the grab
// handle, the header) always. A long pull or a quick flick does it.
import { useEffect, useRef } from 'react'

const SWIPE_UP_ENGAGE = 14
const SWIPE_UP_EXPAND = 60

export function useSwipeUpToExpand(ref, onExpand, zones) {
  const expandRef = useRef(onExpand)
  expandRef.current = onExpand
  const { skip, list: listSel, handle } = zones
  useEffect(() => {
    const el = ref.current?.closest?.('.sheet') || ref.current
    if (!el) return
    let g = null   // { x, y, t, up, on }
    const startsHere = target => {
      if (!target?.closest) return false
      if (target.closest(skip)) return false
      const list = target.closest(listSel)
      if (list) return list.scrollHeight <= list.clientHeight + 1
      return !!target.closest(handle)
    }
    const start = e => {
      g = e.touches.length === 1 && startsHere(e.target) ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), up: 0, on: false } : null
    }
    const move = e => {
      if (!g) return
      const dx = e.touches[0].clientX - g.x, dy = e.touches[0].clientY - g.y
      if (!g.on) {
        if (dy > SWIPE_UP_ENGAGE || Math.abs(dx) > SWIPE_UP_ENGAGE && Math.abs(dx) > Math.abs(dy)) { g = null; return }
        if (dy > -SWIPE_UP_ENGAGE || -dy < Math.abs(dx) * 1.5) return
        g.on = true
      }
      g.up = Math.max(0, -dy - SWIPE_UP_ENGAGE)
      if (e.cancelable) e.preventDefault()
    }
    const end = () => {
      const d = g
      g = null
      if (!d || !d.on) return
      const fast = d.up > 30 && d.up / Math.max(1, Date.now() - d.t) > 0.5
      if (d.up > SWIPE_UP_EXPAND || fast) expandRef.current()
    }
    const cancel = () => { g = null }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', cancel)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', cancel)
    }
  }, [ref, skip, listSel, handle])
}
