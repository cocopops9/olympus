// Olympus: Atlas, the titan who holds up the sky, beside the volume lifted in a workout: the
// weight carried. A portrait in the style of the coaches (illustrated in Canva, assets/atlas.webp):
// he kneels, the night-blue sphere of the heavens on his shoulders.
import atlas from '../assets/atlas.webp'

export default function Atlas({ size = 34, title }) {
  return <img className="atlas" src={atlas} width={size} height={size} alt={title || ''} aria-hidden={title ? undefined : 'true'}
    style={{ borderRadius: '50%', objectFit: 'cover', display: 'block', flex: 'none' }} draggable={false} />
}
