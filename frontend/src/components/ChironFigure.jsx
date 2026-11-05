// Olympus: Chiron, the old centaur who trained Achilles, drawn whole (illustrated in Canva,
// assets/chiron-full-*.webp, cut out on a clear background): lying asleep with his legs folded
// and his arms crossed, or standing awake on his four hooves. One figure, posed by `state`:
//
//   asleep     eyes shut, head low, breathing slowly; z's drift up
//   waking     he really wakes up, as a moving picture (6 s, 18 frames a second): he stirs, lifts
//              his head and opens his eyes, sits up in a big stretch and a yawn, braces on his arms,
//              pushes up on his front legs, brings his hind legs under him and stands, dust at his
//              hooves, and the movement ends exactly on the awake portrait
//   idle       awake, breathing, the light around him
//   listening  leaning in, rings of sound coming to him
//   thinking   still, three dots rising
//   speaking   he moves with his words (`mouth`, 0 to 1, set many times a second), waves going out
//
// The wake-up is `assets/chiron-wake.webp`, a sprite sheet of 108 frames (12 by 9). It was made in
// Canva as 22 drawings of the movement, close enough to each other that the computer can fill in
// the frames between them by following the motion of every part, on a slow timeline whose speed
// changes smoothly instead of stopping at each drawing (scripts/chiron-wake). The drawings
// face right like the awake portrait; the sleeping portrait is shown mirrored to match. The frames
// are played by time (`useWakeClip`), not by CSS steps, so a slow frame never slows the movement.
// Everything else is CSS (chiron-figure.css).
import { useEffect, useRef } from 'react'
import awakeImg from '../assets/chiron-full-awake.webp'
import asleepImg from '../assets/chiron-full-asleep.webp'
import wakeSheet from '../assets/chiron-wake.webp'

export const CHIRON_AWAKE = awakeImg
export const CHIRON_ASLEEP = asleepImg

export const WAKE_FRAMES = 108
export const WAKE_FPS = 18
const SHEET_COLS = 12
const SHEET_ROWS = 9

/** Where frame `i` of the sheet is, as a CSS background-position. */
export const wakeFramePosition = i => {
  const k = Math.max(0, Math.min(WAKE_FRAMES - 1, i | 0))
  return (k % SHEET_COLS) / (SHEET_COLS - 1) * 100 + '% ' + Math.floor(k / SHEET_COLS) / (SHEET_ROWS - 1) * 100 + '%'
}

const reducedMotion = () => {
  try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/** Plays the wake-up frames on `ref` while `on`, by the clock, and holds the last one. */
function useWakeClip(ref, on) {
  useEffect(() => {
    const el = ref.current
    if (!on || !el) return undefined
    const last = WAKE_FRAMES - 1
    if (reducedMotion()) { el.style.backgroundPosition = wakeFramePosition(last); return undefined }
    const start = performance.now()
    let raf = 0, tick = 0, shown = -1
    const draw = () => {
      const i = Math.min(last, Math.floor((performance.now() - start) * WAKE_FPS / 1000))
      if (i !== shown) { shown = i; el.style.backgroundPosition = wakeFramePosition(i) }
      return i >= last
    }
    draw()
    if (typeof requestAnimationFrame === 'function') {
      const loop = () => { if (!draw()) raf = requestAnimationFrame(loop) }
      raf = requestAnimationFrame(loop)
    } else {
      tick = setInterval(() => { if (draw()) clearInterval(tick) }, 1000 / WAKE_FPS)
    }
    return () => { if (raf) cancelAnimationFrame(raf); if (tick) clearInterval(tick) }
  }, [ref, on])
}

// Dust at the hooves: [start x %, drift x %, drift y %, delay s]. Two puffs: when he pushes up on
// his front legs (about 3.7 s), and when the hind legs come up under him (about 4.5 s).
const DUST = [[44, -14, -5, 3.7], [52, -8, -8, 3.73], [60, -2, -9, 3.71],
  [30, 2, -8, 4.48], [38, 8, -9, 4.52], [46, 14, -6, 4.5], [54, 20, -3, 4.54]]
// The glint of his eyes opening: [x, y, size, delay s], in the 100 by 100 drawing.
const GLINTS = [[73, 38, 1.3, 0.7], [68, 37, 1, 0.74]]

export default function ChironFigure({ state = 'asleep', mouth = 0, size = 150, className = '' }) {
  const open = Math.max(0, Math.min(1, Number(mouth) || 0))
  const awake = state !== 'asleep'
  const waking = state === 'waking'
  const clip = useRef(null)
  useWakeClip(clip, waking)
  // Ready before he wakes, so the first frames are not waiting for the picture.
  useEffect(() => {
    if (state !== 'asleep' || typeof Image === 'undefined') return
    const img = new Image()
    img.src = wakeSheet
  }, [state])
  return <span className={'chf chf-' + state + ' ' + className} style={{ width: size, height: size, '--talk': open }} role="img" aria-label="Chiron">
    <span className="chf-halo" />
    <span className="chf-ground" />
    {waking && <span className="chf-burst" aria-hidden="true">
      <i className="shock s1" />
      {DUST.map(([x, dx, dy, d], k) => <i key={'d' + k} className="dust" style={{ '--x': x + '%', '--dx': dx + '%', '--dy': dy + '%', '--d': d + 's' }} />)}
    </span>}
    <span className="chf-body">
      <img className={'chf-img chf-sleep' + (awake ? '' : ' on')} src={asleepImg} alt="" draggable={false} />
      {waking && <span ref={clip} className="chf-clip" style={{ backgroundImage: 'url(' + wakeSheet + ')', backgroundPosition: wakeFramePosition(0) }} />}
      <img className={'chf-img chf-wake' + (awake ? ' on' : '')} src={awakeImg} alt="" draggable={false} />
    </span>
    <svg className="chf-fx" viewBox="0 0 100 100" aria-hidden="true">
      {state === 'waking' && <g className="chf-sparks" fill="#fff8d0" stroke="#d99a00" strokeWidth=".4">
        {GLINTS.map(([x, y, s, d], k) => <path key={k} className="sp" d="M0-3L.6-.6 3 0 .6.6 0 3-.6.6-3 0-.6-.6Z"
          style={{ '--x': x + 'px', '--y': y + 'px', '--s': s, '--d': d + 's' }} />)}
      </g>}
      <g className="chf-z" fill="#f5c84a" stroke="#1a1200" strokeWidth=".6" fontFamily="Georgia,serif" fontWeight="700">
        <text className="z1" x="68" y="38" fontSize="9">z</text><text className="z2" x="61" y="29" fontSize="12">z</text><text className="z3" x="52" y="19" fontSize="15">Z</text>
      </g>
      <g className="chf-rings" transform="translate(-10 -16)" fill="none" stroke="#f5c84a" strokeWidth="2.6" strokeLinecap="round">
        <path className="r1" d="M84 34c3 4 3 10 0 14" /><path className="r2" d="M90 28c6 7 6 19 0 26" /><path className="r3" d="M96 22c8 10 8 28 0 38" />
      </g>
      <g className="chf-dots" fill="#f5c84a" stroke="#1a1200" strokeWidth=".8">
        <circle className="d1" cx="80" cy="18" r="3" /><circle className="d2" cx="88" cy="11" r="3.6" /><circle className="d3" cx="96" cy="4" r="4.2" />
      </g>
      <g className="chf-waves" transform="translate(-12 -24)" fill="none" stroke="#f5c84a" strokeWidth="2.6" strokeLinecap="round">
        <path className="w1" d="M82 40c3 2 3 7 0 9" /><path className="w2" d="M88 36c5 4 5 13 0 17" /><path className="w3" d="M94 32c7 6 7 19 0 25" />
      </g>
    </svg>
  </span>
}
