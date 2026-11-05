// Olympus: Chiron, the old centaur who trained Achilles, drawn whole (illustrated in Canva,
// assets/chiron-full-*.webp, cut out on a clear background): lying asleep with his legs folded
// and his arms crossed, or standing awake on his four hooves. One figure, posed by `state`:
//
//   asleep     eyes shut, head low, breathing slowly; z's drift up
//   waking     he really wakes up, drawn frame by frame (2.8 s): he stirs and the z's burst, lifts
//              his head and opens his eyes, sits up in a big stretch and a yawn, pushes up on his
//              front legs, stands, turns, and settles into the awake portrait, dust at his hooves
//   idle       awake, breathing, the light around him
//   listening  leaning in, rings of sound coming to him
//   thinking   still, three dots rising
//   speaking   he moves with his words (`mouth`, 0 to 1, set many times a second), waves going out
//
// The two portraits cross-fade; `waking` goes through four drawings in between (chiron-wake-1 to 4,
// made in Canva from the two portraits, so the style and the figure are the same), each a short
// cross-fade into the next while the body moves with them. Every move is CSS (chiron-figure.css).
import awakeImg from '../assets/chiron-full-awake.webp'
import asleepImg from '../assets/chiron-full-asleep.webp'
import wake1 from '../assets/chiron-wake-1.webp'
import wake2 from '../assets/chiron-wake-2.webp'
import wake3 from '../assets/chiron-wake-3.webp'
import wake4 from '../assets/chiron-wake-4.webp'

const WAKE_FRAMES = [wake1, wake2, wake3, wake4]

export const CHIRON_AWAKE = awakeImg
export const CHIRON_ASLEEP = asleepImg

// Dust at the hooves: [start x %, drift x %, drift y %, delay s]. Two puffs: when he pushes up on
// his front legs, and when the hind legs come up under him.
const DUST = [[30, -14, -5, 1.38], [38, -8, -8, 1.42], [46, -2, -9, 1.4],
  [52, 2, -8, 1.86], [60, 8, -9, 1.9], [68, 14, -6, 1.88], [76, 20, -3, 1.92]]
// The glint of his eyes opening: [x, y, size, delay s], in the 100 by 100 drawing.
const GLINTS = [[22, 40, 1.3, 0.55], [27, 39, 1, 0.6]]

export default function ChironFigure({ state = 'asleep', mouth = 0, size = 150, className = '' }) {
  const open = Math.max(0, Math.min(1, Number(mouth) || 0))
  const awake = state !== 'asleep'
  return <span className={'chf chf-' + state + ' ' + className} style={{ width: size, height: size, '--talk': open }} role="img" aria-label="Chiron">
    <span className="chf-halo" />
    <span className="chf-ground" />
    {state === 'waking' && <span className="chf-burst" aria-hidden="true">
      <i className="shock s1" />
      {DUST.map(([x, dx, dy, d], k) => <i key={'d' + k} className="dust" style={{ '--x': x + '%', '--dx': dx + '%', '--dy': dy + '%', '--d': d + 's' }} />)}
    </span>}
    <span className="chf-body">
      <img className={'chf-img chf-sleep' + (awake ? '' : ' on')} src={asleepImg} alt="" draggable={false} />
      {state === 'waking' && WAKE_FRAMES.map((src, k) => <img key={k} className={'chf-img chf-wf chf-wf' + (k + 1)} src={src} alt="" draggable={false} />)}
      <img className={'chf-img chf-wake' + (awake ? ' on' : '')} src={awakeImg} alt="" draggable={false} />
    </span>
    <svg className="chf-fx" viewBox="0 0 100 100" aria-hidden="true">
      {state === 'waking' && <g className="chf-sparks" fill="#fff8d0" stroke="#d99a00" strokeWidth=".4">
        {GLINTS.map(([x, y, s, d], k) => <path key={k} className="sp" d="M0-3L.6-.6 3 0 .6.6 0 3-.6.6-3 0-.6-.6Z"
          style={{ '--x': x + 'px', '--y': y + 'px', '--s': s, '--d': d + 's' }} />)}
      </g>}
      <g className="chf-z" fill="#f5c84a" stroke="#1a1200" strokeWidth=".6" fontFamily="Georgia,serif" fontWeight="700">
        <text className="z1" x="30" y="38" fontSize="9">z</text><text className="z2" x="37" y="29" fontSize="12">z</text><text className="z3" x="45" y="19" fontSize="15">Z</text>
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
