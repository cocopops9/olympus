// Olympus: Chiron, the old centaur who trained Achilles, drawn whole (illustrated in Canva,
// assets/chiron-full-*.webp, cut out on a clear background): lying asleep with his legs folded
// and his arms crossed, or standing awake on his four hooves. One figure, posed by `state`:
//
//   asleep     eyes shut, head low, breathing slowly; z's drift up
//   waking     he really wakes up, as a moving picture (1.3 s, 36 frames a second): he lifts his head
//              and opens his eyes, gets his hands down and his front legs under him, rises, brings
//              his hind legs up and stands, dust at his hooves, and the movement ends exactly on
//              the awake portrait
//   idle       awake, breathing, the light around him
//   listening  leaning in, rings of sound coming to him
//   thinking   still, three dots rising
//   speaking   he moves with his words (`mouth`, 0 to 1, set many times a second), waves going out
//
// The wake-up is `assets/chiron-wake.webp`, a sprite sheet of 48 frames (8 by 6). It was made in
// Canva as drawings of the movement, ten of them kept (a quick wake-up has no time for stretches),
// close enough to each other that the computer can fill in the frames between them by following
// the motion of every part (scripts/chiron-wake). The drawings
// face right like the awake portrait; the sleeping portrait is shown mirrored to match. The frames
// are played by time (`useWakeClip`), not by CSS steps, so a slow frame never slows the movement,
// and drawn on a canvas at every screen refresh with the two frames around the moment blended, so
// the movement is continuous (36 frames on a 60 Hz screen would otherwise be held unevenly). The
// awake portrait takes over only once the last frame has really been drawn.
// Everything else is CSS (chiron-figure.css).
import { useEffect, useRef, useState } from 'react'
import awakeImg from '../assets/chiron-full-awake.webp'
import asleepImg from '../assets/chiron-full-asleep.webp'
import wakeSheet from '../assets/chiron-wake.webp'

export const CHIRON_AWAKE = awakeImg
export const CHIRON_ASLEEP = asleepImg

export const WAKE_FRAMES = 48
export const WAKE_FPS = 36
export const WAKE_SECONDS = WAKE_FRAMES / WAKE_FPS
const SHEET_COLS = 8
const SHEET_ROWS = 6
const CELL = 256

/** Where frame `i` of the sheet is, as a CSS background-position. */
export const wakeFramePosition = i => {
  const k = Math.max(0, Math.min(WAKE_FRAMES - 1, i | 0))
  return (k % SHEET_COLS) / (SHEET_COLS - 1) * 100 + '% ' + Math.floor(k / SHEET_COLS) / (SHEET_ROWS - 1) * 100 + '%'
}

const reducedMotion = () => {
  try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

// The sheet as a decoded picture, loaded once (and again if it failed): resolves to { img }, or to
// null when there is no picture to draw from.
let sheetLoad = null
function loadSheet() {
  if (typeof Image === 'undefined') return Promise.resolve(null)
  if (!sheetLoad) {
    sheetLoad = new Promise(resolve => {
      const img = new Image()
      img.onload = () => resolve({ img })
      img.onerror = () => { sheetLoad = null; resolve(null) }
      img.src = wakeSheet
    })
  }
  return sheetLoad
}

/**
 * Plays the wake-up on the canvas `ref` while `on`, by the clock, from the moment the sheet is
 * ready, and tells `hooks.onStart` when the first frame is on screen and `hooks.onDone` when the
 * last one is. Without a 2D canvas it falls back to the sheet as the element's background.
 */
function useWakeClip(ref, on, hooks) {
  const cb = useRef(hooks)
  cb.current = hooks
  useEffect(() => {
    const el = ref.current
    if (!on || !el) return undefined
    const last = WAKE_FRAMES - 1
    let stopped = false, raf = 0, tick = 0, started = false, finished = false
    const finish = () => { if (!finished) { finished = true; cb.current.onDone?.() } }
    const begin = () => { if (!started) { started = true; cb.current.onStart?.() } }
    if (reducedMotion()) {
      el.style.backgroundPosition = wakeFramePosition(last)
      const t = setTimeout(() => { begin(); finish() }, 0)
      return () => clearTimeout(t)
    }
    let ctx = null
    try { ctx = el.getContext?.('2d') || null } catch { ctx = null }
    // The clock starts when the first frame can be drawn, so a slow sheet never skips the start.
    let t0 = 0
    const run = draw => {
      t0 = performance.now()
      const step = () => {
        if (stopped) return
        const pos = Math.min(last, (performance.now() - t0) * WAKE_FPS / 1000)
        draw(pos)
        begin()
        if (pos >= last) { finish(); return }
        if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(step)
      }
      step()
      if (typeof requestAnimationFrame !== 'function') tick = setInterval(() => { if (stopped || finished) clearInterval(tick); else step() }, 1000 / WAKE_FPS)
    }
    if (ctx) {
      loadSheet().then(got => {
        if (stopped) return
        if (!got) { fallback(); return }
        const img = got.img
        const px = Math.max(1, Math.min(CELL, Math.round(el.clientWidth * (window.devicePixelRatio || 1)) || CELL))
        el.width = px; el.height = px
        const cell = (i, alpha) => {
          const k = Math.max(0, Math.min(last, i))
          ctx.globalAlpha = alpha
          ctx.drawImage(img, (k % SHEET_COLS) * CELL, Math.floor(k / SHEET_COLS) * CELL, CELL, CELL, 0, 0, px, px)
        }
        run(pos => {
          const i = Math.floor(pos), w = pos - i
          ctx.clearRect(0, 0, px, px)
          // 'lighter' adds the two premultiplied frames: exactly (1 - w) of this one and w of the next.
          ctx.globalCompositeOperation = 'lighter'
          cell(i, i >= last ? 1 : 1 - w)
          if (i < last && w > 0.002) cell(i + 1, w)
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1
        })
      })
    } else fallback()
    function fallback() {
      el.style.backgroundImage = 'url(' + wakeSheet + ')'
      el.style.backgroundPosition = wakeFramePosition(0)
      let shown = -1
      run(pos => { const i = Math.floor(pos); if (i !== shown) { shown = i; el.style.backgroundPosition = wakeFramePosition(i) } })
    }
    return () => { stopped = true; if (raf) cancelAnimationFrame(raf); if (tick) clearInterval(tick) }
  }, [ref, on])
}

// Dust at the hooves: [start x %, drift x %, drift y %, delay s]. Two puffs: when he pushes up on
// his front legs (about 0.6 s), and when the hind legs come up under him (about 0.9 s).
const DUST = [[44, -14, -5, 0.62], [52, -8, -8, 0.63], [60, -2, -9, 0.62],
  [30, 2, -8, 0.88], [38, 8, -9, 0.89], [46, 14, -6, 0.88], [54, 20, -3, 0.9]]
// The glint of his eyes opening: [x, y, size, delay s], in the 100 by 100 drawing.
const GLINTS = [[73, 38, 1.3, 0.2], [68, 37, 1, 0.24]]

export default function ChironFigure({ state = 'asleep', mouth = 0, size = 150, className = '' }) {
  const open = Math.max(0, Math.min(1, Number(mouth) || 0))
  const awake = state !== 'asleep'
  const waking = state === 'waking'
  const clip = useRef(null)
  // `playing`: the first frame is on screen (the sleeping portrait steps aside); `done`: the last
  // one is (the awake portrait, the same pose, takes over in the same instant).
  const [playing, setPlaying] = useState(false)
  const [done, setDone] = useState(false)
  useWakeClip(clip, waking && !done, { onStart: () => setPlaying(true), onDone: () => setDone(true) })
  useEffect(() => { if (!waking) { setPlaying(false); setDone(false) } }, [waking])
  // Ready before he wakes, so the first frames are not waiting for the picture.
  useEffect(() => { if (state === 'asleep') loadSheet() }, [state])
  return <span className={'chf chf-' + state + ' ' + className} style={{ width: size, height: size, '--talk': open }} role="img" aria-label="Chiron">
    <span className="chf-halo" />
    <span className="chf-ground" />
    {waking && <span className="chf-burst" aria-hidden="true">
      <i className="shock s1" />
      {DUST.map(([x, dx, dy, d], k) => <i key={'d' + k} className="dust" style={{ '--x': x + '%', '--dx': dx + '%', '--dy': dy + '%', '--d': d + 's' }} />)}
    </span>}
    <span className="chf-body">
      <img className={'chf-img chf-sleep' + (!awake || (waking && !playing) ? ' on' : '')} src={asleepImg} alt="" draggable={false} />
      {waking && !done && <canvas ref={clip} className="chf-clip" width={CELL} height={CELL} />}
      <img className={'chf-img chf-wake' + (awake && (!waking || done) ? ' on' : '')} src={awakeImg} alt="" draggable={false} />
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
