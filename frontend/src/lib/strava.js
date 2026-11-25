// A finished workout as a Strava activity (Settings → Strava), worked out from the workout alone.
// The server only checks and forwards it (supabase/functions/olympus/strava.js cleanActivity):
// the names, units and set labels are the app's, so they read on Strava as they do in the history.
//
// Strava's manual activity (POST /api/v3/activities) takes a name, a sport type, the local start
// time without a zone, the elapsed seconds and, optionally, a description, a distance in metres
// and whether it was done on a machine indoors (`trainer`). Strava shows the duration and the
// distance itself, so the description carries what it cannot: the exercises and their sets.
import { workoutText } from './workout-text.js'
import { modeForEntry, hasCompletedWork, isWarmupRow } from './workout-model.js'

// Strava's sport types (developers.strava.com, SportType). Anything else goes as "Workout"; the
// server posts a type an older Strava refuses once more as "Workout" too.
const SPORT_TYPES = {
  'sport-football': 'Soccer',
  'sport-basketball': 'Basketball',
  'sport-swimming': 'Swim',
  'sport-tennis': 'Tennis',
  'sport-padel': 'Padel',
  'sport-volleyball': 'Volleyball',
  'sport-beach-volleyball': 'Volleyball',
  'sport-badminton': 'Badminton',
  'sport-table-tennis': 'TableTennis',
  'sport-squash': 'Squash',
  'sport-climbing': 'RockClimbing',
  'sport-hiking': 'Hike',
  'sport-skiing': 'AlpineSki',
  'sport-snowboarding': 'Snowboard',
  'sport-surfing': 'Surfing',
  'sport-golf': 'Golf',
  'sport-cycling': 'Ride',
  'sport-ice-skating': 'IceSkate',
  'sport-roller-skating': 'InlineSkate',
  'sport-skateboarding': 'Skateboard',
  'sport-cricket': 'Cricket',
  'sport-zumba': 'Dance',
  'sport-ballet': 'Dance',
  'sport-hip-hop-dance': 'Dance',
  'sport-canoeing': 'Canoeing',
  'sport-sailing': 'Sail',
  'sport-gymnastics': 'Workout',
  'sport-triathlon': 'Workout',
}

// Cardio machines in the catalogue, by exercise id (as lib/health-connect.js files them). On a
// machine indoors, so `trainer` is set: Strava then expects no GPS track.
const CARDIO_TYPES = {
  '3666': 'Walk',                    // walking on incline treadmill
  '0685': 'Run', '0684': 'Run', '3656': 'Run',
  '2138': 'Ride', '0798': 'Ride',    // stationary bike
  '2141': 'Elliptical', '2331': 'Elliptical',
  '2311': 'StairStepper',
}
const DISTANCE_TYPES = new Set(['Run', 'Walk', 'Ride'])

const worked = w => (w?.entries || []).filter(e => (e.sets || []).some(s => hasCompletedWork(s) && !isWarmupRow(s)))

/**
 * The Strava sport type for workout `w`, with `trainer` when it was on an indoor machine. Any
 * strength work makes it weight training: ten minutes on the treadmill before the squats do not
 * make it a run. One sport alone is that sport; one cardio machine alone is its activity.
 */
export function sportTypeOf(w) {
  const done = worked(w)
  if (!done.length) return { sport_type: 'Workout' }
  const sports = done.filter(e => String(e.id).startsWith('sport-'))
  if (sports.length && sports.length === done.length) {
    const types = new Set(sports.map(e => SPORT_TYPES[e.id] || 'Workout'))
    return { sport_type: types.size === 1 ? [...types][0] : 'Workout' }
  }
  if (done.some(e => modeForEntry(e) !== 'cardio')) return { sport_type: 'WeightTraining' }
  const types = new Set(done.map(e => CARDIO_TYPES[e.id] || 'Workout'))
  if (types.size !== 1) return { sport_type: 'Workout' }
  const type = [...types][0]
  return type === 'Workout' ? { sport_type: type } : { sport_type: type, trainer: true }
}

/** Metres covered on the cardio sets (minutes × speed, speed kept in km/h: lib/speed.js). */
export function distanceOf(w) {
  let km = 0
  for (const e of worked(w)) {
    for (const s of e.sets || []) {
      if (!hasCompletedWork(s) || isWarmupRow(s)) continue
      const min = Number(s.min), speed = Number(s.speed)
      if (min > 0 && speed > 0) km += (min / 60) * speed
    }
  }
  return Math.round(km * 1000)
}

const pad = n => String(n).padStart(2, '0')
/** `ms` as Strava's start_date_local: the wall-clock time where the phone is, with no zone. */
export function localIso(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * The activity for workout `w`, or null when there is none to post: no id, nothing done, or no
 * start and end (a workout without its times is left out rather than given made-up ones).
 * `unit`, `nameOf` and `speedUnit` are what "Copy as text" takes (lib/workout-text.js).
 */
export function activityFor(w, { unit, nameOf, speedUnit }) {
  const start = Number(w?.start), end = Number(w?.end)
  if (!w?.id || !(start > 0) || !(end > start) || !worked(w).length) return null
  const { sport_type, trainer } = sportTypeOf(w)
  // "Copy as text" without its heading line (name and date: Strava shows both), keeping the line
  // of totals under it and every exercise after.
  const [head, ...rest] = workoutText(w, { unit, nameOf, speedUnit }).split('\n\n')
  const description = [head.split('\n').slice(1).join('\n'), ...rest].filter(Boolean).join('\n\n')
  const distance = DISTANCE_TYPES.has(sport_type) ? distanceOf(w) : 0
  return {
    wid: String(w.id),
    name: String(w.name || '').trim() || 'Workout',
    sport_type,
    start_date_local: localIso(start),
    elapsed_time: Math.max(1, Math.round((end - start) / 1000)),
    ...(description ? { description } : {}),
    ...(distance > 0 ? { distance } : {}),
    ...(trainer ? { trainer: true } : {}),
  }
}

/** Marks workout `w` to be posted to Strava. In place on the document `s`. */
export function queueStrava(s, w) {
  if (!s?.stravaOn || !w?.id || !worked(w).length) return
  s.stravaQ = { ...(s.stravaQ || {}), [w.id]: '' }
}

/** Takes workout id `wid` off the queue. In place on `s`. */
export function unqueueStrava(s, wid) {
  if (!s?.stravaQ || !(wid in s.stravaQ)) return
  const next = { ...s.stravaQ }
  delete next[wid]
  s.stravaQ = next
}

/**
 * What to do with a queued workout after the server answered `e` (null: it was posted):
 * 'done' takes it off the queue, 'off' takes Strava off (the connection is gone), 'retry' keeps it.
 */
export function outcomeOf(e) {
  if (!e) return 'done'
  const code = e.data?.code
  if (code === 'strava-off' || code === 'no-strava' || e.status === 404) return 'off'
  if (code === 'strava-refused' || code === 'bad-activity' || e.status === 400 || e.status === 422) return 'done'
  return 'retry'
}
