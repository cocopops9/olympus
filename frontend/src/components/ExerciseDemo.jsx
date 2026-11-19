// Olympus: an exercise shown while a coach explains it. Asked "how do I do the squat?", Chiron,
// Hercules and Athena answer in words (and aloud in voice mode) beside the exercise's own
// animation from the library (lib/exercise-demo.js decides which exercise a question asks about).
import { useMemo } from 'react'
import { useStore } from '../store/useStore.js'
import { CATALOGUE, EXIDX } from '../lib/exercises.js'
import { exerciseNameFor } from '../lib/i18n.js'
import { demoExercise } from '../lib/exercise-demo.js'
import Media from './Media.jsx'
import '../exercise-demo.css'

const nameOf = e => [exerciseNameFor(e), e.n]

// The exercises the person trains (the workout in progress and the recent ones): theirs win a tie.
function ownIds(S) {
  const ids = new Set()
  for (const e of S?.active?.entries || []) if (e?.id) ids.add(e.id)
  for (const w of (S?.workouts || []).slice(-30)) for (const e of w?.entries || []) if (e?.id) ids.add(e.id)
  return ids
}

/** The exercise a question asks to see, or null. `currentId`: the exercise being trained now. */
export function demoFor(question, S, currentId = null) {
  if (!question) return null
  const current = currentId ? EXIDX[currentId] || null : null
  const ex = demoExercise(question, { list: CATALOGUE, nameOf, prefer: ownIds(S), current })
  return ex && ex.gif ? ex : null
}

/** The exercise asked about in `question`, worked out once per question. */
export function useDemo(question, currentId = null) {
  const S = useStore(s => s.S)
  // The person's own exercises only break ties: read once per question, not on every set ticked.
  return useMemo(() => demoFor(question, S, currentId), [question, currentId])
}

/** The animation with the exercise's name under it. */
export default function ExerciseDemo({ ex, compact = true }) {
  if (!ex) return null
  return <figure className={'exdemo' + (compact ? ' compact' : '')}>
    <Media ex={ex} compact />
    <figcaption>{exerciseNameFor(ex)}</figcaption>
  </figure>
}

/**
 * Under a coach's answer: the exercise the question before it asked to see, if any. `currentId`:
 * the exercise being trained (Chiron), for "how do I do this one?".
 */
export function DemoAfter({ list, i, currentId = null }) {
  const prev = list[i - 1]
  const question = prev?.role === 'user' ? prev.content : null
  const ex = useDemo(question, currentId)
  return ex ? <ExerciseDemo ex={ex} /> : null
}
