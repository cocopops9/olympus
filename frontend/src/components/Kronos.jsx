// Olympus: Kronos, the titan of time, beside a workout's running time. A medallion in the style of
// the coaches (illustrated in Canva, assets/kronos.webp), with his hourglass as a layer of its own
// (assets/kronos-hourglass.webp) so it can turn: it stands a few seconds, then he turns it over,
// and again, for as long as the workout runs. A paused workout holds it still; so does reduced motion.
import kronos from '../assets/kronos.webp'
import hourglass from '../assets/kronos-hourglass.webp'

export default function Kronos({ paused = false, size = 34, title }) {
  return <span className={'kronos' + (paused ? ' paused' : '')} style={{ width: size, height: size }}
    role={title ? 'img' : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : 'true'}>
    <img className="kronos-base" src={kronos} alt="" draggable={false} />
    <img className="kronos-glass" src={hourglass} alt="" draggable={false} />
  </span>
}
