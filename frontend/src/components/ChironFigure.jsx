// Olympus: Chiron, the old centaur who trained Achilles, drawn whole (illustrated in Canva,
// assets/chiron-full-*.webp, cut out on a clear background): lying asleep with his legs folded
// and his arms crossed, or standing awake on his four hooves. One figure, posed by `state`:
//
//   asleep     eyes shut, head low, breathing slowly; z's drift up
//   waking     he stirs, a flash of light covers the change, and the awake portrait springs up out of
//              it with dust at his hooves, a shock ring on the ground and sparks flying out (1.8 s)
//   idle       awake, breathing, the light around him
//   listening  leaning in, rings of sound coming to him
//   thinking   still, three dots rising
//   speaking   he moves with his words (`mouth`, 0 to 1, set many times a second), waves going out
//
// The two portraits cross-fade, except in `waking`, where the change is cut under the flash so the
// two never show through each other; every move is CSS (chiron-figure.css).
import awakeImg from '../assets/chiron-full-awake.webp'
import asleepImg from '../assets/chiron-full-asleep.webp'

export const CHIRON_AWAKE = awakeImg
export const CHIRON_ASLEEP = asleepImg

// Dust at the hooves: [start x %, drift x %, drift y %, delay s].
const DUST = [[34, -16, -4, 0.62], [42, -9, -7, 0.68], [50, -3, -9, 0.64], [58, 6, -8, 0.7], [66, 13, -5, 0.66], [74, 20, -3, 0.72]]
// Sparks from the chest: [x, y, drift x, drift y, size, delay s], in the 100 by 100 drawing.
const SPARKS = [[48, 40, -34, -26, 1.2, 0.56], [52, 38, -14, -38, 1.5, 0.58], [56, 40, 12, -36, 1.1, 0.6], [60, 42, 34, -24, 1.4, 0.57],
  [46, 50, -40, -6, 1, 0.62], [62, 50, 40, -4, 1.1, 0.64], [50, 36, -24, -34, .9, 0.66], [58, 36, 24, -32, 1, 0.68]]

export default function ChironFigure({ state = 'asleep', mouth = 0, size = 150, className = '' }) {
  const open = Math.max(0, Math.min(1, Number(mouth) || 0))
  const awake = state !== 'asleep'
  return <span className={'chf chf-' + state + ' ' + className} style={{ width: size, height: size, '--talk': open }} role="img" aria-label="Chiron">
    <span className="chf-halo" />
    {state === 'waking' && <span className="chf-rays" />}
    <span className="chf-ground" />
    {state === 'waking' && <span className="chf-burst" aria-hidden="true">
      <i className="shock s1" /><i className="shock s2" />
      {DUST.map(([x, dx, dy, d], k) => <i key={'d' + k} className="dust" style={{ '--x': x + '%', '--dx': dx + '%', '--dy': dy + '%', '--d': d + 's' }} />)}
    </span>}
    <span className="chf-body">
      <img className={'chf-img chf-sleep' + (awake ? '' : ' on')} src={asleepImg} alt="" draggable={false} />
      <img className={'chf-img chf-wake' + (awake ? ' on' : '')} src={awakeImg} alt="" draggable={false} />
    </span>
    {state === 'waking' && <span className="chf-flash" aria-hidden="true" />}
    <svg className="chf-fx" viewBox="0 0 100 100" aria-hidden="true">
      {state === 'waking' && <g className="chf-sparks" fill="#fff3b0" stroke="#d99a00" strokeWidth=".5">
        {SPARKS.map(([x, y, dx, dy, s, d], k) => <path key={k} className="sp" d="M0-3L.8-.8 3 0 .8.8 0 3-.8.8-3 0-.8-.8Z"
          style={{ '--x': x + 'px', '--y': y + 'px', '--dx': dx + 'px', '--dy': dy + 'px', '--s': s, '--d': d + 's' }} />)}
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
