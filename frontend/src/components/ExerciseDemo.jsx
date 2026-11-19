// Olympus: an exercise shown inside a coach's answer (the coach-actions "show_exercise"): the
// catalogue's own animation of a figure doing it, looping while the coach explains it in words
// (and aloud, in voice mode).
import { useStore } from '../store/useStore.js'
import { EXIDX, gifSrc, imgSrc, isVideoSrc, figureOf } from '../lib/exercises.js'
import { exerciseNameText } from '../lib/format.js'
import { t } from '../lib/i18n.js'

export default function ExerciseDemo({ id }) {
  const S = useStore(s => s.S)
  const ex = EXIDX[id] || (S.customEx || []).find(e => e.id === id)
  if (!ex) return null
  const fig = figureOf(S)
  const clip = ex.gif || ex.sport ? gifSrc(ex, fig) : null
  const still = ex.img || ex.sport ? imgSrc(ex, fig) : null
  const name = exerciseNameText(ex)
  return <figure className="ex-demo" aria-label={t('How to do {0}', name)}>
    {clip && isVideoSrc(clip)
      ? <video src={clip} poster={still || undefined} autoPlay muted loop playsInline preload="metadata" aria-hidden="true" />
      : (clip || still) ? <img src={clip || still} alt="" loading="lazy" /> : null}
    <figcaption className="ex-demo-n">{name}</figcaption>
  </figure>
}
