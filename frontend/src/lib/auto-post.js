// Olympus: every finished workout becomes a post in the feed, on its own.
//
// What is still to be posted is kept in the training document itself, so it survives a restart
// and goes out from whichever device is online first:
//   S.wposts   { [workout id]: '' }  waiting to be posted
//              { [workout id]: <post id> }  posted
//              { [workout id]: '-' }  not to be posted (its post was deleted, or the server
//                                     refused it for good)
//   S.postDel  [post id, ...]  posts to delete, waiting for a connection
//   S.wpostEdit { [workout id]: { text, photos } }  the description and photos written for a
//              workout's post (after the workout, or later), waiting to be sent; the title is the
//              workout's own name
// The server makes a second post of the same workout return the first (api/social.js, `wid`),
// so a retry whose answer was lost, or two devices emptying the same queue, never doubles one.
//
// Nothing is queued for a profile that has no server account (training on this device only), or
// when the person switched auto-posting off (S.autoPost === false).
import { useStore } from '../store/useStore.js'
import { EXIDX } from './exercises.js'
import { exerciseNameFor } from './i18n.js'
import { speedUnitOf } from './speed.js'
import { createPost, editPost, deletePost, socialReady, workoutPostSummary } from './social.js'
import { stampWorkout } from './sync-merge.js'
import { setCover, learnCovers } from './workout-cover.js'
import { fetchProfile } from './social.js'

export const POSTED_EVENT = 'olympus:posted'
const RETRY_MS = 60000

export const autoPostOn = S => S?.autoPost !== false

const nameOfEntry = e => (EXIDX[e.id] ? exerciseNameFor(EXIDX[e.id]) : (e.n || e.id))
export const summaryFor = (w, S) => workoutPostSummary(w, { unit: S.unit, nameOf: nameOfEntry, speedUnit: speedUnitOf(S) })

// A post's song as kept until it is sent: an uploaded clip ({ id, title }) or a catalogue track
// (lib/music.js: { src, id, title, artist, art, preview }).
const keepSong = x => ({
  id: String(x.id), title: String(x.title || '').slice(0, 80),
  ...(x.src ? { src: String(x.src), artist: String(x.artist || '').slice(0, 60), ...(x.art ? { art: String(x.art).slice(0, 300) } : {}), start: Math.max(0, Math.round(Number(x.start) || 0)), ...(x.preview ? { preview: String(x.preview).slice(0, 400) } : {}) } : {}),
})

/** Marks logged workout `w` to be posted. In place on the document `s`. */
export function queuePost(s, w) {
  // A workout finished with nothing checked off has nothing to show.
  if (!w?.id || !autoPostOn(s) || !(w.entries || []).length) return
  s.wposts = { ...(s.wposts || {}), [w.id]: '' }
}

/** What happens to `w`'s post when `w` is deleted: the post goes too. In place on `s`. */
export function forgetPost(s, w) {
  const id = w?.id && s.wposts?.[w.id]
  if (!w?.id || !s.wposts || !(w.id in s.wposts)) return
  const next = { ...s.wposts }
  delete next[w.id]
  s.wposts = next
  if (id && id !== '-') s.postDel = [...new Set([...(s.postDel || []), id])]
}

/** Takes `w`'s post back (it is deleted from the feed) and keeps it from being posted again. */
export function unpost(s, w) {
  if (!w?.id) return
  const id = s.wposts?.[w.id]
  s.wposts = { ...(s.wposts || {}), [w.id]: '-' }
  if (id && id !== '-') s.postDel = [...new Set([...(s.postDel || []), id])]
}

/** Puts `w` back in the queue, after an Undo or for a workout that was never posted. */
export function repost(s, w) {
  if (!w?.id) return
  s.wposts = { ...(s.wposts || {}), [w.id]: '' }
}

/** What was written for `w`'s post and not sent yet, or null. */
export const postDetails = (S, w) => (w?.id && S?.wpostEdit?.[w.id]) || null

/**
 * The title, description and photo ids for `w`'s post. The title is the workout's name, so it
 * shows in the history too. Writing any of it means the workout is meant to be posted: one taken
 * back or never queued goes in the queue. In place on `s`.
 */
export function setPostDetails(s, w, { title, text = '', photos = [], song } = {}) {
  if (!w?.id) return
  const rec = s.workouts.find(x => x.id === w.id)
  const name = String(title ?? '').trim().slice(0, 80)
  if (rec && name && name !== rec.name) { rec.name = name; stampWorkout(rec) }
  // The song: { id, title }, null when taken off; left out when the editor never touched it.
  const tune = song === undefined ? {} : { song: song && song.id ? keepSong(song) : null }
  s.wpostEdit = { ...(s.wpostEdit || {}), [w.id]: { text: String(text || '').trim().slice(0, 1000), photos: [...new Set(photos)].slice(0, 4), ...tune } }
  // The list shows the first photo as the workout's picture straight away (lib/workout-cover.js).
  setCover(w.id, photos[0] || null)
  const v = s.wposts?.[w.id]
  if (v === undefined || v === '-') s.wposts = { ...(s.wposts || {}), [w.id]: '' }
}

const dropDetails = wid => useStore.getState().update(s => {
  if (s.wpostEdit && wid in s.wpostEdit) { const n = { ...s.wpostEdit }; delete n[wid]; s.wpostEdit = n }
})
const announce = post => {
  if (post?.wid) learnCovers([post])
  if (post?.id && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(POSTED_EVENT, { detail: post }))
}

/** The post state of workout `w`: 'none', 'waiting', 'posted' (with its id) or 'off'. */
export function postState(S, w) {
  const v = w?.id ? S?.wposts?.[w.id] : undefined
  if (v === undefined) return { state: 'none' }
  if (v === '') return { state: 'waiting' }
  if (v === '-') return { state: 'off' }
  return { state: 'posted', id: v }
}

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false
// A refusal that will be the same next time: the post is dropped from the queue, not retried.
const final = e => e?.status === 400 || e?.status === 403 || e?.status === 413

let running = null

// Workouts whose post waits while the finish screen is open, so the photos, song and words put
// there go out with the post itself rather than as an edit after it (FinishSummary). Kept in
// memory only: if the app is closed meanwhile, the post simply goes out at the next start.
const held = new Set()
/** Keeps workout `wid`'s post from going out until releasePost(wid). */
export const holdPost = wid => { if (wid) held.add(wid) }
/** Lets workout `wid`'s post go out, and sends what is waiting. */
export function releasePost(wid) {
  if (!wid || !held.delete(wid)) return
  // A flush already running skipped this post; the next one, after it, sends it.
  const go = () => flushPosts().catch(() => {})
  if (running) running.finally(go); else go()
}
export const isHeld = wid => held.has(wid)

/**
 * Posts what is waiting and deletes what was deleted, one at a time; stops at the first failure
 * that may pass (no network, the server down) and leaves the rest for the next try.
 */
export function flushPosts() {
  if (running) return running
  running = (async () => {
    const store = useStore.getState()
    if (!socialReady(store.user) || !store.ready || !online()) return
    for (const id of [...(store.S.postDel || [])]) {
      try { await deletePost(id) } catch (e) { if (e?.status !== 404 && !final(e)) return }
      useStore.getState().update(s => { s.postDel = (s.postDel || []).filter(x => x !== id) })
    }
    const waiting = Object.entries(useStore.getState().S.wposts || {}).filter(([, v]) => v === '').map(([k]) => k)
    for (const wid of waiting) {
      if (held.has(wid)) continue
      const S = useStore.getState().S
      const w = S.workouts.find(x => x.id === wid)
      if (!w) { useStore.getState().update(s => { if (s.wposts) { const n = { ...s.wposts }; delete n[wid]; s.wposts = n } }); continue }
      const details = S.wpostEdit?.[wid] || null
      let post
      try { post = await createPost({ text: details?.text || '', photos: details?.photos, song: details?.song || undefined, workout: summaryFor(w, S), wid }) } catch (e) {
        if (!final(e)) return
        useStore.getState().update(s => { s.wposts = { ...(s.wposts || {}), [wid]: '-' } })
        dropDetails(wid)
        continue
      }
      let gone = false
      useStore.getState().update(s => {
        // Deleted while the post was on its way: the post goes as well.
        if (!s.wposts || s.wposts[wid] !== '') { gone = true; if (post?.id) s.postDel = [...new Set([...(s.postDel || []), post.id])]; return }
        s.wposts = { ...s.wposts, [wid]: post?.id || '-' }
      })
      // A retry finds the post made the first time, before the description was written: the
      // edit pass below brings it up to date. Otherwise what was written went out with it.
      if (!gone && details && post && (post.text || '') === details.text && JSON.stringify(post.photos || []) === JSON.stringify(details.photos || [])
        && (details.song === undefined || (post.song?.id || null) === (details.song?.id || null))) dropDetails(wid)
      if (!gone) announce(post)
    }
    // Descriptions, photos and titles written for posts already in the feed.
    for (const [wid, details] of Object.entries(useStore.getState().S.wpostEdit || {})) {
      if (held.has(wid)) continue
      const S = useStore.getState().S
      const id = S.wposts?.[wid]
      const w = S.workouts.find(x => x.id === wid)
      if (!id || id === '-' || !w) { if (id !== '') dropDetails(wid); continue }
      let post
      try { post = await editPost({ id, text: details.text, photos: details.photos, workout: summaryFor(w, S), ...(details.song !== undefined ? { song: details.song } : {}) }) } catch (e) {
        if (e?.status === 404) { useStore.getState().update(s => { s.wposts = { ...(s.wposts || {}), [wid]: '-' } }); dropDetails(wid); continue }
        if (!final(e)) return
        dropDetails(wid)
        continue
      }
      dropDetails(wid)
      announce(post)
    }
  })().finally(() => { running = null })
  return running
}

const pending = S => (S?.postDel || []).length > 0 || Object.values(S?.wposts || {}).some(v => v === '') || Object.keys(S?.wpostEdit || {}).length > 0

/** Empties the queue when the app is ready, when the network comes back, and every minute while something waits. */
export function startAutoPost() {
  if (typeof window === 'undefined') return () => {}
  const kick = () => { if (pending(useStore.getState().S)) flushPosts().catch(() => {}) }
  const unsub = useStore.subscribe((s, prev) => {
    if ((s.ready && !prev.ready) || (s.user?.id && s.user?.id !== prev.user?.id) || ((s.S.wposts !== prev.S.wposts || s.S.wpostEdit !== prev.S.wpostEdit) && pending(s.S))) kick()
  })
  window.addEventListener('online', kick)
  const timer = setInterval(kick, RETRY_MS)
  kick()
  // Once per start, as soon as the account can reach its server: the pictures of your own
  // recent posts, for the workouts they came from (lib/workout-cover.js).
  let learned = false
  const learn = () => {
    const st = useStore.getState()
    if (learned || !socialReady(st.user) || !st.ready) return
    learned = true
    fetchProfile().then(p => learnCovers(p?.posts), () => { learned = false })
  }
  const unlearn = useStore.subscribe(learn)
  learn()
  return () => { unsub(); unlearn(); window.removeEventListener('online', kick); clearInterval(timer) }
}
