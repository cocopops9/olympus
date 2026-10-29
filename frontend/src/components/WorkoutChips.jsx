import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { exOr } from '../lib/exercises.js'
import { exerciseNameText } from '../lib/format.js'
import { exerciseChips } from '../lib/exercise-chips.js'
import { revealChip } from '../lib/use-sheet-keyboard.js'
import { t } from '../lib/i18n.js'

// The chip row at the top of a running workout (#323, the "coloured dots" of #163): one numbered
// chip per exercise, a superset as one chip, filled as far as it is done (empty, half, full), so
// the state reads without the colour too. The current one wears the accent ring. A tap jumps
// there; what "there" means is the view's call (onPick), since Cards, List and Focus each go to
// an exercise differently.
//
// Olympus: a chip is also how an exercise is moved or taken out. Held still for a moment it lifts
// (a buzz says so): dragged along the row it moves its exercise there one place at a time
// (onMove), let go without moving it opens the exercise's menu (onHold: move, swap, remove).
//
// The row has one fixed height whatever happens in it, so ticking a set or typing a weight never
// moves the page under your thumb, and it scrolls sideways on its own (the .chips strip rules in
// index.css), never the page.
// Functions, so each word is a literal t() call the string checks can see.
const STATE_WORD = { done: () => t('Finished'), partial: () => t('Started'), todo: () => t('Not started yet') }
export const HOLD_MS = 420
const SLOP = 8

export default function WorkoutChips({ entries, cur, onPick, onHold, onMove }) {
  const strip = useRef(null)
  const chips = exerciseChips(entries, cur)
  const chipsRef = useRef(chips)
  chipsRef.current = chips
  const curKey = chips.find(c => c.current)?.key
  const press = useRef(null)
  const [lifted, setLifted] = useState(null)   // the position (0-based) of the chip being held
  // Keep the current chip in view along the strip, as the filter strips do (useRevealActiveChip):
  // after a tap, a swipe to the next card, or the marker moving on. Only the strip scrolls.
  useEffect(() => {
    const el = strip.current
    const chip = el?.querySelector?.('[aria-current]')
    if (chip) revealChip(el, chip)
  }, [curKey, chips.length])
  // While a chip is held the finger drags it rather than scrolling the strip: the touch that
  // follows the hold is cancelled before the browser can start a pan with it.
  useEffect(() => {
    const el = strip.current
    if (!el) return
    const stop = e => { if (press.current?.held && e.cancelable) e.preventDefault() }
    el.addEventListener('touchmove', stop, { passive: false })
    return () => el.removeEventListener('touchmove', stop)
  }, [chips.length > 0])
  useEffect(() => () => clearTimeout(press.current?.timer), [])
  if (!chips.length) return null

  const editable = !!(onHold || onMove)
  const end = () => { const p = press.current; if (p) clearTimeout(p.timer); press.current = null; setLifted(null) }
  const chipUnder = x => {
    const els = [...(strip.current?.querySelectorAll('[data-unit-key]') || [])]
    return els.findIndex(el => { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right })
  }
  const handlers = (c, i) => (editable ? {
    onPointerDown: e => {
      end()
      const p = { pos: i, x: e.clientX, y: e.clientY, held: false, dragged: false }
      p.timer = setTimeout(() => {
        p.held = true
        setLifted(p.pos)
        try { navigator.vibrate?.(15) } catch { /* no haptics */ }
      }, HOLD_MS)
      press.current = p
    },
    onPointerMove: e => {
      const p = press.current
      if (!p) return
      if (!p.held) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP) end()   // a scroll of the strip
        return
      }
      if (!onMove) return
      try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* old browsers */ }
      const to = chipUnder(e.clientX)
      if (to < 0 || to === p.pos) return
      const dir = to > p.pos ? 1 : -1
      const unit = chipsRef.current[p.pos]?.unit
      if (!unit || onMove(unit[0], dir) === false) return
      p.dragged = true
      p.pos += dir
      setLifted(p.pos)
    },
    onPointerUp: () => {
      const p = press.current
      if (!p) return
      clearTimeout(p.timer)
      if (p.held) {
        p.swallow = true   // the click this release makes is not a tap
        if (!p.dragged && onHold) onHold(chipsRef.current[p.pos])
      }
      setLifted(null)
    },
    onPointerCancel: end,
    onContextMenu: e => e.preventDefault(),
  } : {})

  return <nav ref={strip} className={'chips wchips' + (lifted != null ? ' dragging' : '')} aria-label={t('Exercises in this workout')}>
    {chips.map((c, i) => {
      const names = c.unit.map(idx => exerciseNameText(exOr(entries[idx].id))).join(' + ')
      const label = c.unit.length > 1
        ? t('Superset {0}: {1} ({2})', c.n, names, STATE_WORD[c.state]())
        : t('Exercise {0}: {1} ({2})', c.n, names, STATE_WORD[c.state]())
      return <button key={c.key} type="button" className={'wchip ' + c.state + (c.current ? ' cur' : '') + (lifted === i ? ' lifted' : '')}
        data-unit-key={c.key} aria-current={c.current ? 'step' : undefined}
        aria-label={label} aria-description={editable ? t('Hold to move or remove it.') : undefined} title={names}
        {...handlers(c, i)}
        onClick={() => {
          const p = press.current
          if (p?.swallow) { press.current = null; return }
          end()
          onPick(c)
        }}>
        <span>{c.n}</span>{c.unit.length > 1 && <Icon name="link" />}
      </button>
    })}
  </nav>
}
