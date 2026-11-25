// Posting finished workouts to Strava (lib/strava.js says what is posted; this file sends it).
//
// The queue is kept in the training document, like the feed's (lib/auto-post.js), so it survives a
// restart and goes out from whichever device is online first:
//   S.stravaOn  true while the account is connected to Strava (Settings → Strava sets it from the
//               server's answer, and a post the server answers "not connected" clears it)
//   S.stravaQ   { [workout id]: '' }  waiting to be posted
// The server posts a workout once (strava.js `posted`), so a retry whose answer was lost, or two
// devices emptying the same queue, never doubles an activity.
import { useStore } from '../store/useStore.js'
import { api } from './api.js'
import { EXIDX } from './exercises.js'
import { exerciseNameFor } from './i18n.js'
import { speedUnitOf } from './speed.js'
import { activityFor, unqueueStrava, outcomeOf } from './strava.js'

const RETRY_MS = 60000
const nameOfEntry = e => (EXIDX[e.id] ? exerciseNameFor(EXIDX[e.id]) : (e.n || e.id))
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false
const pending = S => !!S?.stravaOn && Object.keys(S?.stravaQ || {}).length > 0

let running = null

/** Sends every queued workout, one at a time. Resolves when the queue has been tried once. */
export function flushStrava() {
  if (running) return running
  running = (async () => {
    const st = useStore.getState()
    if (!st.user || !pending(st.S) || !online()) return
    for (const wid of Object.keys(st.S.stravaQ || {})) {
      const S = useStore.getState().S
      if (!S.stravaOn) return
      const w = (S.workouts || []).find(x => String(x?.id) === wid)
      // A workout deleted since, or one with nothing to post: off the queue.
      const activity = w && activityFor(w, { unit: S.unit, nameOf: nameOfEntry, speedUnit: speedUnitOf(S) })
      let error = null
      if (activity) {
        try { await api('/api/strava/post', { method: 'POST', body: JSON.stringify(activity) }) } catch (e) { error = e }
      }
      const outcome = outcomeOf(error)
      if (outcome === 'retry') return     // offline or Strava busy: the rest waits for the next try
      useStore.getState().update(s => {
        if (outcome === 'off') { s.stravaOn = false; s.stravaQ = {} } else unqueueStrava(s, wid)
      })
      if (outcome === 'off') return
    }
  })().finally(() => { running = null })
  return running
}

/** Empties the queue when the app is ready, when the network comes back, and every minute while something waits. */
export function startStrava() {
  if (typeof window === 'undefined') return () => {}
  const kick = () => { if (pending(useStore.getState().S)) flushStrava().catch(() => {}) }
  const unsub = useStore.subscribe((s, prev) => {
    if ((s.ready && !prev.ready) || (s.user?.id && s.user?.id !== prev.user?.id) || (s.S.stravaQ !== prev.S.stravaQ && pending(s.S))) kick()
  })
  window.addEventListener('online', kick)
  const timer = setInterval(kick, RETRY_MS)
  kick()
  return () => { unsub(); window.removeEventListener('online', kick); clearInterval(timer) }
}
