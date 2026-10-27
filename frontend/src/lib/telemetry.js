// Olympus: usage statistics, sent only by a person who agreed to share them (S.telemetry === true,
// asked once by components/TelemetryConsent.jsx, switched in Settings). What goes to the server:
//   open    the app came to the front: one session;
//   screen  seconds spent on a screen (the route, ids taken out by the server), only while the
//           app is in front;
//   event   a feature used, by name: 'workout.finish', 'coach.ask', 'post.create' (FEATURES).
// Never what was trained, written or said. The server sums it per day (api/insights.js) for the
// owner's dashboard (views/Owner.jsx). Turned off, the server's copy is deleted.
import { api } from './api.js'
import { MOBILE } from './mobile.js'

const QUEUE_KEY = 'olympus_tel_queue'
const QUEUE_MAX = 500
const FLUSH_MS = 60000
const NEW_SESSION_AFTER_MS = 30 * 60000   // back in front after this long counts as a new session
const MAX_SCREEN_SEC = 2 * 3600            // a screen left open overnight is not two hours of use

/** The features the dashboard knows by name, so it can also show the ones nobody uses. */
export const FEATURES = [
  'workout.start', 'workout.finish', 'workout.discard', 'routine.create', 'routine.start',
  'exercise.create', 'coach.ask', 'coach.action', 'coach.voice', 'post.create', 'post.like', 'post.comment',
  'follow', 'measurement.add', 'photo.add', 'invite.share', 'feedback.send', 'backup.export',
]

let enabled = false
let queue = []
let screen = null          // { path, since }
let hiddenAt = 0
let timer = null
let listeners = []
let info = { platform: MOBILE ? 'android' : 'web', version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '' }
let send = body => api('/api/telemetry', { method: 'POST', body: JSON.stringify(body), keepalive: true })
const now = () => Date.now()

function loadQueue() { try { const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); return Array.isArray(q) ? q : [] } catch { return [] } }
function saveQueue() { try { if (queue.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); else localStorage.removeItem(QUEUE_KEY) } catch { /* private window */ } }
function push(e) {
  if (!enabled) return
  queue.push(e)
  if (queue.length > QUEUE_MAX) queue = queue.slice(-QUEUE_MAX)
  saveQueue()
}

function closeScreen(at = now()) {
  if (!screen) return
  const sec = Math.min(MAX_SCREEN_SEC, Math.round((at - screen.since) / 1000))
  if (sec >= 1 && !screen.hidden) push({ t: at, type: 'screen', path: screen.path, sec })
  screen = null
}

/** A feature was used. Does nothing unless the person shares statistics. */
export function track(name, n = 1) {
  if (!enabled || !/^[a-z][a-z0-9_.-]{1,39}$/.test(name)) return
  push({ t: now(), type: 'event', name, ...(n > 1 ? { n } : {}) })
}

/** The route shown now; the time on the one before is counted. */
export function trackScreen(path) {
  if (!enabled) return
  const at = now()
  if (screen?.path === path) return
  closeScreen(at)
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') screen = { path, since: at }
  else screen = { path, since: at, hidden: true }
}

/** Sends what is waiting. Kept for the next try when the server cannot be reached. */
export async function flush() {
  if (!enabled || !queue.length) return
  const batch = queue.slice(0, 200)
  try {
    await send({ consent: true, events: batch, ...info })
    queue = queue.slice(batch.length)
    saveQueue()
  } catch { /* offline: stays queued */ }
}

function onVisibility() {
  const at = now()
  if (document.visibilityState === 'hidden') {
    const path = screen?.path
    closeScreen(at)
    if (path) screen = { path, since: at, hidden: true }
    hiddenAt = at
    flush()
    return
  }
  if (hiddenAt && at - hiddenAt > NEW_SESSION_AFTER_MS) push({ t: at, type: 'open' })
  hiddenAt = 0
  if (screen?.hidden) screen = { path: screen.path, since: at }
}

/** Starts collecting for a person who agreed. `path` is the screen shown now. */
export function startTelemetry(path) {
  if (enabled) return
  enabled = true
  queue = loadQueue()
  push({ t: now(), type: 'open' })
  if (path) trackScreen(path)
  // A first upload soon after start, so a new person shows up on the dashboard the same minute.
  setTimeout(() => { flush() }, 5000)
  timer = setInterval(() => {
    // The screen still open is counted up to now, so a long stay reaches the server before the app is closed.
    if (screen && !screen.hidden) { const p = screen.path; closeScreen(); screen = { path: p, since: now() } }
    flush()
  }, FLUSH_MS)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
    listeners.push(() => document.removeEventListener('visibilitychange', onVisibility))
  }
  if (MOBILE) {
    import('@capacitor/app').then(({ App }) => App.addListener('appStateChange', ({ isActive }) => {
      // The WebView's own visibility events are not reliable on every Android version.
      if (!isActive && document.visibilityState !== 'hidden') { hiddenAt = now(); const p = screen?.path; closeScreen(); if (p) screen = { path: p, since: now(), hidden: true }; flush() }
      else if (isActive && hiddenAt) { if (now() - hiddenAt > NEW_SESSION_AFTER_MS) push({ t: now(), type: 'open' }); hiddenAt = 0; if (screen?.hidden) screen = { path: screen.path, since: now() } }
    })).then(h => { listeners.push(() => h.remove()) }).catch(() => {})
  }
}

/** Stops collecting. `forget`: also drop what is waiting and ask the server to delete its copy. */
export async function stopTelemetry({ forget = false } = {}) {
  if (enabled) { closeScreen(); if (!forget) await flush() }
  enabled = false
  clearInterval(timer); timer = null
  listeners.forEach(f => { try { f() } catch { /* already gone */ } })
  listeners = []
  screen = null
  if (forget) {
    queue = []
    saveQueue()
    await api('/api/telemetry/forget', { method: 'POST', body: '{}' }).catch(() => {})
  }
}

export const telemetryOn = () => enabled

// Tests only.
export function _setSender(fn) { send = fn }
export function _state() { return { enabled, queue: queue.slice(), screen } }
export function _reset() { enabled = false; queue = []; screen = null; hiddenAt = 0; clearInterval(timer); timer = null; listeners = []; try { localStorage.removeItem(QUEUE_KEY) } catch { /* none */ } }
