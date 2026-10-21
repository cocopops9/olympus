// Olympus social layer, client side: the calls to /api/social/* (api/social.js on the server)
// and the one piece of logic worth a unit test, turning a logged workout into the bounded
// summary a post carries (workoutPostSummary).
//
// Everything here needs a profile on a server: a guest, or a phone kept local, has nobody to
// post as. socialReady() is the single check the screens use before calling anything.
import { api, apiBlob } from './api.js'
import { sessionSections, workoutVolume, workoutDuration, workoutDay, doneUnits, setLabel } from './history.js'
import { isWarmupRow } from './workout-model.js'

/** Whether this device can use the feed: signed in to (or paired with) a server profile. */
export const socialReady = user => !!(user && user.id)

const q = params => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') s.set(k, String(v))
  const out = s.toString()
  return out ? '?' + out : ''
}
const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) })

export const searchUsers = text => api('/api/social/search' + q({ q: text })).then(r => r.users || [])
export const fetchProfile = (id, before) => api('/api/social/profile' + q({ id, before }))
export const saveBio = bio => post('/api/social/profile', { bio }).then(r => r.user)
/** Bio, `private` and `pushSocial`, any of them; answers your profile as it now is. */
export const saveProfile = change => post('/api/social/profile', change).then(r => r.user)
export const fetchPost = id => api('/api/social/post' + q({ id })).then(r => r.post)
export const removeFollower = id => post('/api/social/followers/remove', { id }).then(r => r.user)
export const fetchRequests = () => api('/api/social/requests').then(r => r.users || [])
export const answerRequest = (id, accept) => post('/api/social/requests/answer', { id, accept }).then(r => r.users || [])
export const setBlock = (id, block) => post('/api/social/block', { id, block }).then(r => r.user)
export const fetchBlocked = () => api('/api/social/blocked').then(r => r.users || [])
export const fetchNotifications = () => api('/api/social/notifications')
export const markNotificationsRead = () => post('/api/social/notifications/read')
/** A photo as a data URL (what preparePhoto makes); answers its id, to put in a post. */
export const uploadPhoto = data => post('/api/social/photos', { data }).then(r => r.id)
// The server sends 2 MB at most; a little over that is refused before it is read.
export const photoBlob = id => apiBlob('/api/social/photo' + q({ id }), { expectSize: 2 * 1024 * 1024 })
export const fetchConnections = (id, kind) => api('/api/social/connections' + q({ id, kind })).then(r => r.users || [])
export const setFollow = (id, follow) => post('/api/social/follow', { id, follow }).then(r => r.user)
export const fetchFeed = before => api('/api/social/feed' + q({ before }))
export const fetchDiscover = before => api('/api/social/discover' + q({ before }))
export const createPost = ({ text, workout, photos }) => post('/api/social/posts', { text, workout, photos: photos && photos.length ? photos : undefined }).then(r => r.post)
export const deletePost = id => post('/api/social/posts/delete', { id })
export const setLike = (id, like) => post('/api/social/posts/like', { id, like }).then(r => r.post)
export const addComment = (id, text) => post('/api/social/posts/comment', { id, text }).then(r => r.post)
export const deleteComment = (id, commentId) => post('/api/social/posts/comment/delete', { id, commentId }).then(r => r.post)

// How heavy or long a logged set was, to pick the one a post shows as the exercise's best:
// load first, then reps, then time on a timed or cardio set. A per-side set counts its
// stronger side, which is what the lifter would quote.
function setScore(s) {
  const sides = s && s.sides ? [s.sides.L, s.sides.R].filter(Boolean) : [s]
  return Math.max(...sides.map(x => (Number(x?.w) || 0) * 1e6 + (Number(x?.r) || 0) * 1e3
    + (Number(x?.min) || 0) * 60 + (Number(x?.sec) || 0) + (Number(x?.speed) || 0)))
}

/**
 * The summary a post carries for a logged workout `w`: its name, day, duration, volume, the
 * number of work sets, new records, and per exercise how many work sets were done with the best
 * of them as the history would print it. Warm-ups are left out of the counts, as they are of
 * the volume and the records everywhere else. Exercises with no completed work set are left out
 * altogether. `nameOf(entry)` is the exercise's display name; `unit` the profile's.
 *
 * Bounded to what the server keeps (api/social.js cleanWorkout): never the sets themselves.
 */
export function workoutPostSummary(w, { unit = 'kg', nameOf = e => e.n || e.id, speedUnit } = {}) {
  const entries = (w && w.entries) || []
  const order = sessionSections(entries).flatMap(section => section.units).flat()
  const seen = new Set()
  const indices = [...order, ...entries.map((_, i) => i)].filter(i => !seen.has(i) && seen.add(i) && entries[i])
  let total = 0
  const exercises = []
  for (const i of indices) {
    const e = entries[i]
    const work = (e.sets || []).filter(s => !isWarmupRow(s) && doneUnits(s) > 0)
    const n = work.reduce((m, s) => m + doneUnits(s), 0)
    if (!n) continue
    total += n
    const best = work.reduce((a, b) => (setScore(b) > setScore(a) ? b : a))
    exercises.push({ n: String(nameOf(e) || e.id || '').slice(0, 80), sets: n, best: String(setLabel(e.id, best, e.target, speedUnit)).slice(0, 40) })
  }
  return {
    name: String(w?.name || '').slice(0, 80),
    d: workoutDay(w),
    durMs: workoutDuration(w),
    vol: Math.round((w?.vol ?? workoutVolume(w)) * 10) / 10 || 0,
    unit: unit === 'lb' ? 'lb' : 'kg',
    sets: total,
    prs: Array.isArray(w?.prs) ? w.prs.length : 0,
    exercises: exercises.slice(0, 20),
  }
}

/**
 * The size a photo is scaled to before upload: the longer side at most `max` pixels, the
 * proportions kept, never enlarged. Whole pixels, at least one.
 */
export function fitWithin(w, h, max = 1600) {
  const W = Math.max(1, Math.round(Number(w) || 0)), H = Math.max(1, Math.round(Number(h) || 0))
  const k = Math.min(1, max / Math.max(W, H))
  return { w: Math.max(1, Math.round(W * k)), h: Math.max(1, Math.round(H * k)) }
}

/** What the follow button says for a profile: Following, Requested (private, waiting) or Follow. */
export const followLabel = (user, t) => (user?.isFollowing ? t('Following') : user?.requested ? t('Requested') : t('Follow'))

/** One notification as a sentence, with the name of who did it. */
export function notificationLine(n, t) {
  const who = n?.from?.name || '?'
  switch (n?.kind) {
    case 'like': return t('{0} liked your post', who)
    case 'comment': return n.text ? t('{0} commented: {1}', who, n.text) : t('{0} commented on your post', who)
    case 'follow': return t('{0} started following you', who)
    case 'request': return t('{0} wants to follow you', who)
    case 'accepted': return t('{0} accepted your follow request', who)
    default: return who
  }
}

/** Two letters for an avatar: first and last word of the name, or the first two letters. */
export function initialsOf(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const pick = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)
  return pick.toUpperCase()
}

/** A stable hue for an avatar, from the profile id: the same person keeps the same colour. */
export function hueOf(id) {
  let h = 0
  for (const ch of String(id || '')) h = (h * 31 + ch.codePointAt(0)) % 360
  return h
}

/** A failure from these calls as a sentence for a toast. */
export function socialErrorText(e, t) {
  if (e && e.code === 'not-paired') return t('Connect to a server to use the feed.')
  if (e && e.status === 401) return t('Sign in again to use the feed.')
  if (e && e.status === 429) return t('Slow down a little: too many posts in the last hour.')
  if (e && e.code === 'photo-too-large') return t('That photo is too large.')
  if (e && e.code === 'photo-type') return t('Only JPEG and PNG photos can be posted.')
  if (e && e.code === 'blocked') return t('Unblock this profile first.')
  if (e && e.code === 'private') return t('This profile is private.')
  if (e && e.status === 404) return t('That post or profile no longer exists.')
  if (e && e.status == null) return t('The server could not be reached.')
  return (e && e.message) || t('Something went wrong.')
}
