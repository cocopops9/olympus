// Olympus: Chiron, the old centaur who trained Achilles, drawn whole (illustrated in Canva,
// assets/chiron-full-*.webp, cut out on a clear background): lying asleep with his legs folded
// and his arms crossed, or standing awake on his four hooves. One figure, posed by `state`:
//
//   asleep     eyes shut, head low, breathing slowly; z's drift up
//   waking     he wakes up (1.4 s): he stirs in his sleep, the z's burst, he gathers himself low,
//              then springs up onto his hooves with a little overshoot, dust at his feet and a
//              glint in his eyes
//   idle       awake, breathing, the light around him
//   listening  leaning in, rings of sound coming to him
//   thinking   still, three dots rising
//   speaking   he moves with his words (`mouth`, 0 to 1, set many times a second), waves going out
//
// The wake-up is animated by hand from the two real drawings, the way a game animates a sprite:
// the sleeping drawing stirs and squashes (anticipation), the awake drawing takes its place and
// stretches up past its height before settling (overshoot). Nothing in it is generated: an
// earlier version morphed one drawing into the other with a video model, and the in-between
// frames looked it. The sleeping portrait is shown mirrored to face the same way as the awake one.
// Everything is CSS (chiron-figure.css); this file only says which pose is on.
import awakeImg from '../assets/chiron-full-awake.webp'
import asleepImg from '../assets/chiron-full-asleep.webp'
import { t } from '../lib/i18n.js'

export const CHIRON_AWAKE = awakeImg
export const CHIRON_ASLEEP = asleepImg

/** How long the wake-up takes, in seconds (the keyframes of chiron-figure.css are timed on it). */
export const WAKE_SECONDS = 1.4

// Dust at the hooves when he lands on them: [start x %, drift x %, drift y %, delay s].
const DUST = [[30, -16, -6, 0.74], [40, -9, -9, 0.76], [50, 0, -10, 0.74], [60, 9, -9, 0.76], [70, 16, -6, 0.74]]
// The glint of his eyes opening: [x, y, size, delay s], in the 100 by 100 drawing.
const GLINTS = [[73, 21.5, 1.2, 0.98], [69.5, 21, 0.9, 1.04]]

export default function ChironFigure({ state = 'asleep', mouth = 0, size = 150, className = '' }) {
  const open = Math.max(0, Math.min(1, Number(mouth) || 0))
  const awake = state !== 'asleep'
  const waking = state === 'waking'
  return <span className={'chf chf-' + state + ' ' + className} style={{ width: size, height: size, '--talk': open }} role="img" aria-label={t('Chiron')}>
    <span className="chf-halo" />
    <span className="chf-ground" />
    {waking && <span className="chf-burst" aria-hidden="true">
      <i className="shock s1" />
      {DUST.map(([x, dx, dy, d], k) => <i key={'d' + k} className="dust" style={{ '--x': x + '%', '--dx': dx + '%', '--dy': dy + '%', '--d': d + 's' }} />)}
    </span>}
    <span className="chf-body">
      {/* While he wakes both drawings are there: the keyframes hand over from one to the other. */}
      <img className={'chf-img chf-sleep' + (!awake ? ' on' : '')} src={asleepImg} alt="" draggable={false} />
      <img className={'chf-img chf-wake' + (awake && !waking ? ' on' : '')} src={awakeImg} alt="" draggable={false} />
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
