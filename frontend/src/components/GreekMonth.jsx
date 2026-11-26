// The workout calendar's month banner: the Attic month that themes the shown modern month
// (lib/greek-months.js), with a black-figure scene of its festival on top, its emblem in a gold medallion, its name in Greek and in Latin
// letters, and what the month was dedicated to, between two strips of Greek key.
//
// The emblems are line drawings in currentColor on a 64 × 64 grid, so they take the accent
// colour and stay sharp at any size without shipping an image per month.
import { t } from '../lib/i18n.js'
import { atticMonthFor } from '../lib/greek-months.js'
import Meander from './Meander.jsx'

// Each month's scene: a black-figure frieze of its festival (scripts/greek-scenes), keyed by the
// month's `art`. A month without one shows the banner alone. The glob sits in try/catch because a
// bare `typeof import.meta.glob` check is false in a Vite build (it is a compile-time macro).
let SCENES = {}
try {
  const files = import.meta.glob('../assets/greek-months/*.webp', { eager: true, import: 'default' })
  SCENES = Object.fromEntries(Object.entries(files).map(([path, url]) => [path.split('/').pop().replace('.webp', ''), url]))
} catch (e) { /* no bundler: no scenes */ }

/** The scene picture for an emblem id, or undefined when that month has none. */
export const sceneFor = art => SCENES[art]

const SUN_RAYS = Array.from({ length: 12 }, (_, i) => {
  const a = (i * Math.PI) / 6
  const p = r => (32 + r * Math.cos(a)).toFixed(1) + ' ' + (32 + r * Math.sin(a)).toFixed(1)
  return 'M' + p(15) + 'L' + p(i % 2 ? 21 : 25)
}).join('')

const PALMETTE_PETALS = [-58, -29, 0, 29, 58]
const GRAPES = [[17, 24], [27, 24], [37, 24], [47, 24], [22, 33], [32, 33], [42, 33], [27, 42], [37, 42], [32, 51]]
const WHEAT_ROWS = [20, 28, 36]

const EMBLEMS = {
  amphora: <>
    <path d="M26 8h12M28 8v6M36 8v6M28 14c-8 4-12 12-12 21 0 10 6 17 16 19 10-2 16-9 16-19 0-9-4-17-12-21" />
    <path d="M28 16c-6-2-10 1-10 7M36 16c6-2 10 1 10 7" />
    <path d="M27 56l2-3h6l2 3z" />
    <path d="M17 31h30M17 39h30" />
    <path d="M21 35h3M27 35h3M33 35h3M39 35h3" />
  </>,
  lyre: <>
    <path d="M23 52C14 42 13 26 21 14c-2-3-5-3-6 0M41 52c9-10 10-26 2-38 2-3 5-3 6 0" />
    <path d="M18 20h28M22 52h20" />
    <path d="M27 20v32M32 20v32M37 20v32" />
  </>,
  wheat: <>
    <path d="M32 58V12M32 12c-3-3-3-6 0-8 3 2 3 5 0 8z" />
    {WHEAT_ROWS.map(y => <path key={y} d={`M32 ${y + 7}c-7-1-10-5-10-10 6 0 10 4 10 10zM32 ${y + 7}c7-1 10-5 10-10-6 0-10 4-10 10z`} />)}
    <path d="M32 50c-5-6-12-6-16-4M32 50c5-6 12-6 16-4" />
  </>,
  grapes: <>
    <path d="M32 19V9M32 12c5-6 13-5 16-1-5 5-12 5-16 1z" />
    {GRAPES.map(([x, y]) => <circle key={x + '-' + y} cx={x} cy={y} r="4.6" />)}
  </>,
  thunderbolt: <>
    <path className="gm-fill" d="M38 5L19 34h11l-7 25 22-32H34l9-22z" />
  </>,
  trident: <>
    <path d="M32 50V8M20 11v7c0 6 5 9 12 9s12-3 12-9v-7" />
    <path d="M17 14l3-6 3 6M29 11l3-6 3 6M41 14l3-6 3 6" />
    <path d="M8 50c4-3 8-3 12 0s8 3 12 0 8-3 12 0 8 3 12 0M8 57c4-3 8-3 12 0s8 3 12 0 8-3 12 0 8 3 12 0" />
  </>,
  pomegranate: <>
    <path d="M27 21c-7 2-12 9-12 17 0 10 8 18 17 18s17-8 17-18c0-8-5-15-12-17" />
    <path d="M26 22l1-9 5 5 5-5 1 9" />
    <path d="M38 16c4-6 10-7 14-5-3 5-9 7-14 5z" />
    <circle cx="27" cy="36" r="1.6" className="gm-dot" /><circle cx="35" cy="33" r="1.6" className="gm-dot" />
    <circle cx="31" cy="42" r="1.6" className="gm-dot" /><circle cx="39" cy="41" r="1.6" className="gm-dot" />
    <circle cx="25" cy="44" r="1.6" className="gm-dot" />
  </>,
  flower: <>
    {PALMETTE_PETALS.map(a => <ellipse key={a} cx="32" cy="29" rx="4.2" ry="13" transform={`rotate(${a} 32 45)`} />)}
    <path d="M32 45c-7 0-11 4-9 8s7 2 6-2M32 45c7 0 11 4 9 8s-7 2-6-2M32 45v13" />
  </>,
  bow: <>
    <path d="M22 6c18 11 18 41 0 52M22 6v52" />
    <path d="M8 32h42" />
    <path className="gm-fill" d="M56 32l-8-5v10z" />
    <path d="M12 32l-4-4M12 32l-4 4M17 32l-4-4M17 32l-4 4" />
  </>,
  moon: <>
    <path className="gm-fill" d="M38 9a23 23 0 1 0 0 46a25 25 0 0 1 0-46z" />
    <path d="M48 14v8M44 18h8M52 32v6M49 35h6M44 46v6M41 49h6" />
  </>,
  sun: <>
    <circle cx="32" cy="32" r="10" className="gm-fill" />
    <path d={SUN_RAYS} />
  </>,
  owl: <>
    <path d="M20 22c-2 6-4 12-4 18 0 10 7 16 16 16s16-6 16-16c0-6-2-12-4-18l-5 5c-2-1-5-2-7-2s-5 1-7 2z" />
    <circle cx="26" cy="33" r="5" /><circle cx="38" cy="33" r="5" />
    <circle cx="26" cy="33" r="1.6" className="gm-dot" /><circle cx="38" cy="33" r="1.6" className="gm-dot" />
    <path d="M32 37l-2 4h4z" className="gm-fill" />
    <path d="M25 46l3 3 4-3 4 3 3-3" />
    <path d="M10 58h44M27 56v2M37 56v2" />
  </>,
}

export function GreekMonthArt({ art, size = 56 }) {
  return <svg className="gm-art" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true"
    fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    {EMBLEMS[art]}
  </svg>
}

export default function GreekMonthBanner({ month }) {
  const m = atticMonthFor(month)
  const scene = sceneFor(m.art)
  return <div className={'gm-banner' + (scene ? ' has-scene' : '')} style={{ '--gm': m.tint }} data-art={m.art}>
    {scene
      ? <img className="gm-scene" src={scene} alt="" width="960" height="381" decoding="async" draggable="false" />
      : <Meander id="gm-key-top" className="gm-key" />}
    <div className="gm-body">
      <div className="gm-medal"><GreekMonthArt art={m.art} /></div>
      <div className="gm-text">
        <div className="gm-greek" lang="grc">{m.greek}</div>
        <div className="gm-name">{m.name}</div>
        <div className="gm-theme">{t(m.theme)}</div>
      </div>
      <div className="gm-ghost"><GreekMonthArt art={m.art} size={96} /></div>
    </div>
    <Meander id="gm-key-bottom" className="gm-key" />
  </div>
}
