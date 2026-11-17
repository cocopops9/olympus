// Olympus: which gym a workout was done in, an optional label (w.gym). The same machine can be
// set up very differently in two gyms (a leg press at 145 kg in one is 100 kg in the other), so
// Stats can draw an exercise's progress for one gym at a time (views/Stats.jsx). The names are
// the person's own; the list offered is the ones already used, most used first.
//
// The gym of the latest workout that has one is the default for the next: most people train in
// the same place most of the time, so a finished workout arrives with it already picked. Renaming
// or deleting a gym changes every workout that carries it, each one stamped so the change syncs.
import { stampWorkout } from './sync-merge.js'
import { sameWorkout } from './workout-date.js'

export const GYM_MAX = 40
export const cleanGym = v => String(v || '').trim().replace(/\s+/g, ' ').slice(0, GYM_MAX)

/**
 * The gyms known: the ones already used, most workouts first, then the ones added but not used
 * yet (S.gyms), by name: ['Home', 'McFit Centro', ...].
 */
export function gymsOf(S) {
  const n = new Map()
  for (const w of S?.workouts || []) { const g = cleanGym(w?.gym); if (g) n.set(g, (n.get(g) || 0) + 1) }
  for (const g of Object.keys(S?.gyms || {})) { const c = cleanGym(g); if (c && !n.has(c)) n.set(c, 0) }
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g)
}

// ---- A gym's own card: its picture (S.gyms) --------------------------------------------------
// S.gyms = { [name]: { icon: 'temple', photo: 'data:image/jpeg;…', _ts } }. `icon` names one of
// the drawings that come with the app (components/GymIcon.jsx); `photo` is one the person took, a
// small square JPEG, and wins over the icon. A gym can be here before any workout carries it.
export const GYM_ICONS = ['temple', 'gymnasium', 'palace', 'stadium', 'forge', 'home']
const PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/
export const GYM_PHOTO_MAX = 60000   // characters of the data URL: a 160 px JPEG is ~8–15k

/** The card of gym `name`: { icon, photo }, with the drawing picked by name when none was chosen. */
export function gymMeta(S, name) {
  const g = cleanGym(name)
  const m = (g && S?.gyms?.[g]) || {}
  let icon = GYM_ICONS.includes(m.icon) ? m.icon : null
  if (!icon) { let h = 0; for (const ch of g) h = (h * 31 + ch.charCodeAt(0)) >>> 0; icon = GYM_ICONS[h % GYM_ICONS.length] }
  const photo = typeof m.photo === 'string' && m.photo.length <= GYM_PHOTO_MAX && PHOTO.test(m.photo) ? m.photo : null
  return { icon, photo }
}

/** Adds gym `name` (inside a store update), with its picture when given. Returns the clean name. */
export function saveGym(s, name, { icon, photo } = {}, now = Date.now()) {
  const g = cleanGym(name)
  if (!g) return ''
  const cur = s.gyms?.[g] || {}
  const next = { ...cur, _ts: now }
  if (icon !== undefined) { if (GYM_ICONS.includes(icon)) next.icon = icon; else delete next.icon }
  if (photo !== undefined) { if (photo && photo.length <= GYM_PHOTO_MAX && PHOTO.test(photo)) next.photo = photo; else delete next.photo }
  s.gyms = { ...(s.gyms || {}), [g]: next }
  return g
}

// ---- The gym of the session in progress ------------------------------------------------------
/**
 * The gym of the session in progress: the one picked in it (A.gym, '' for "no gym"), else the
 * workout picked up again keeps its own, else the latest workout's.
 */
export function activeGym(S) {
  const A = S?.active
  if (!A) return ''
  if (typeof A.gym === 'string') return cleanGym(A.gym)
  return lastGym(S)
}

/**
 * The history records are held against. With records per gym on (S.recordsByGym) and a gym on
 * the session, only the workouts in that gym count, and every workout with no gym on it: a
 * workout never labelled could have been anywhere, so it counts for all of them. Off, or with no
 * gym, everything counts, as it always did.
 */
export function recordHistory(S, gym) {
  const g = cleanGym(gym)
  if (!S?.recordsByGym || !g) return S
  return { ...S, workouts: (S.workouts || []).filter(w => { const wg = cleanGym(w?.gym); return !wg || wg === g }) }
}

/** How many saved workouts carry gym `name`. */
export function gymUseCount(S, name) {
  const g = cleanGym(name)
  if (!g) return 0
  return (S?.workouts || []).reduce((n, w) => n + (cleanGym(w?.gym) === g ? 1 : 0), 0)
}

// When a workout happened, for "the latest": its end, else its start, else its day.
const whenOf = w => Number(w?.end) || Number(w?.start) || Date.parse(w?.d || '') || 0

/**
 * The gym of the most recent workout that has one, or '' when none has. `except` leaves one
 * workout out (the one just finished, whose own gym is what is being decided).
 */
export function lastGym(S, except = null) {
  let best = null
  for (const w of S?.workouts || []) {
    if (!cleanGym(w?.gym) || (except && sameWorkout(w, except))) continue
    if (!best || whenOf(w) >= whenOf(best)) best = w
  }
  return best ? cleanGym(best.gym) : ''
}

/** Sets (or, with an empty name, clears) the gym of saved workout `ref`, inside a store update. */
export function setWorkoutGym(s, ref, gym) {
  const rec = (s.workouts || []).find(x => sameWorkout(x, ref))
  if (!rec) return
  const g = cleanGym(gym)
  if (g === cleanGym(rec.gym)) return
  if (g) rec.gym = g; else delete rec.gym
  stampWorkout(rec)
}

/**
 * Renames gym `from` to `to` on every workout, inside a store update. Renaming onto a gym that
 * already exists merges the two. Returns how many workouts changed.
 */
export function renameGym(s, from, to, now = Date.now()) {
  const a = cleanGym(from), b = cleanGym(to)
  if (!a || !b || a === b) return 0
  let n = 0
  for (const w of s.workouts || []) {
    if (cleanGym(w?.gym) !== a) continue
    w.gym = b
    stampWorkout(w, now)
    n++
  }
  // The picture goes with the name, unless the name it lands on has one of its own.
  if (s.gyms?.[a]) {
    const gyms = { ...s.gyms }
    if (!gyms[b]) gyms[b] = { ...gyms[a], _ts: now }
    delete gyms[a]
    s.gyms = gyms
  }
  if (s.active && cleanGym(s.active.gym) === a) s.active.gym = b
  return n
}

/**
 * Takes gym `name` off every workout, inside a store update: the workouts stay, only the label
 * goes. Returns how many workouts changed.
 */
export function deleteGym(s, name, now = Date.now()) {
  const g = cleanGym(name)
  if (!g) return 0
  let n = 0
  for (const w of s.workouts || []) {
    if (cleanGym(w?.gym) !== g) continue
    delete w.gym
    stampWorkout(w, now)
    n++
  }
  if (s.gyms?.[g]) { const gyms = { ...s.gyms }; delete gyms[g]; s.gyms = gyms }
  if (s.active && cleanGym(s.active.gym) === g) s.active.gym = ''
  return n
}

/** The gyms exercise `id` was trained in, most used first. */
export function gymsForExercise(S, id) {
  const n = new Map()
  for (const w of S?.workouts || []) {
    const g = cleanGym(w?.gym)
    if (g && (w.entries || []).some(e => e.id === id)) n.set(g, (n.get(g) || 0) + 1)
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g)
}
