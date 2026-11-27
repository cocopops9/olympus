// Olympus: the server's model of personal strength gains, for the medal tiers.
//
// The tiers of lib/athlete-profile.js need, for each exercise, the gain of z the athlete can expect
// after 6, 16, 40, 80 and 156 weeks of training. When signed in, that comes from the server
// (POST /api/medals/targets, api/medal-model.js): a model fitted to the meet histories of
// OpenPowerlifting lifters of the same sex, age, body weight and starting level, and to the
// 12-week gains of ordinary untrained adults (the FAMuSS study). Without a server
// (guest mode, a phone not paired) or before the first answer, the curve of athlete-profile.js is
// used instead. The answer is kept on the device, so the tiers read the same offline.
//
// Only squat, bench press and deadlift are measured. Every other weighted exercise borrows the
// gains of the one closest to it by the region it trains (assumption: muscles of the same region
// grow at similar relative rates): lower-body presses the squat, hip hinges the deadlift, every
// upper-body exercise the bench press. Rep counts and cardio stay on the curve.
import { api } from './api.js'
import { METRICS } from './strength-level.js'
import { athleteBase, profileOf, effectiveBw } from './athlete-profile.js'

export const MODEL_LIFT = {
  squat: 'squat', 'front-squat': 'squat', 'leg-press': 'squat', 'hip-thrust': 'squat',
  deadlift: 'deadlift', sumo: 'deadlift', rdl: 'deadlift',
  bench: 'bench', incline: 'bench', ohp: 'bench', row: 'bench', pulldown: 'bench', pulldown2: 'bench', curl: 'bench',
}
// Body weights the model is scaled by (api/medal-model.js), in kg.
const REF_BW = { male: 80, female: 62 }
const LB = 0.45359237
const KEY = 'gym_medal_model_v1'
// A cached answer is asked again after this long even when nothing changed: the model may have been retrained.
const MAX_AGE_MS = 7 * 86400000

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } }
let cache = read() || { uid: null, sig: '', gains: {}, at: 0 }
let inflight = null
const listeners = new Set()

/** The server's gains for profile `uid`, by metric key ({ bench: [5 gains] }); {} before any answer. */
export const medalModel = uid => (uid && cache.uid === uid ? cache.gains || {} : {})

/** Calls `fn` whenever new gains arrive; returns the unsubscribe. */
export function onMedalModel(fn) { listeners.add(fn); return () => listeners.delete(fn) }

/** The request items for every weighted exercise whose profile is ready: [{ key, lift, sex, age, bwRatio, z0 }]. */
export function medalTargetItems(S, facts = {}, now = Date.now()) {
  const base = athleteBase(S, now)
  if (!(base.age > 0) || !(base.bw > 0)) return []
  const bw = effectiveBw(base.bw, base.sex, base.fat)
  const bwKg = base.unit === 'lb' ? bw * LB : bw
  const bwRatio = Math.round(bwKg / REF_BW[base.sex] * 100) / 100
  const items = []
  for (const m of METRICS) {
    const lift = MODEL_LIFT[m.key]
    if (!lift || (m.type || 'load') !== 'load') continue
    const p = profileOf(S, m, base, facts)
    if (p.status !== 'ready') continue
    items.push({ key: m.key, lift, sex: base.sex, age: base.age, bwRatio, z0: Math.round(p.z0 * 100) / 100 })
  }
  return items
}

const sigOf = items => JSON.stringify(items)

/**
 * Asks the server for the gains of the ready exercises when the inputs changed (or the answer is
 * old), and keeps the answer for profile `uid`. Resolves to true when new gains arrived. Never throws: without an
 * answer the curve stands in. `request` is api() (a test passes its own).
 */
export async function refreshMedalTargets(S, facts = {}, { uid, now = Date.now(), request = api } = {}) {
  if (!uid) return false
  const items = medalTargetItems(S, facts, now)
  if (!items.length) return false
  const sig = sigOf(items)
  if (uid === cache.uid && sig === cache.sig && now - (cache.at || 0) < MAX_AGE_MS) return false
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await request('/api/medals/targets', { method: 'POST', body: JSON.stringify({ items }) })
      const ok = Array.isArray(r?.weeks) && r.weeks.join() === '6,16,40,80,156'
      const gains = {}
      if (ok) for (const [k, g] of Object.entries(r.gains || {})) if (Array.isArray(g) && g.length === 5 && g.every(Number.isFinite)) gains[k] = g
      if (!ok) return false
      cache = { uid, sig, gains, at: now }
      try { localStorage.setItem(KEY, JSON.stringify(cache)) } catch { /* a convenience: asked again next time */ }
      for (const fn of listeners) fn()
      return true
    } catch { return false } finally { inflight = null }
  })()
  return inflight
}

/** Forgets the kept answer (sign-out, tests). */
export function resetMedalModel() {
  cache = { uid: null, sig: '', gains: {}, at: 0 }
  try { localStorage.removeItem(KEY) } catch { /* nothing kept */ }
}
