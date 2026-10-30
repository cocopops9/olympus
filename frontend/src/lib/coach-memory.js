// Olympus: one memory for every coach. Hercules, Athena, Chiron and the coaches of your own used
// to keep their conversations apart (olympus_<coach>_chats_<uid>), so what you told one the others
// never knew. They now share one store on the device, per profile:
//   { v: 1, current: { <coach>: chatId }, chats: [{ id, coach, title, ts, messages }] }
// Each coach still lists its own conversations; what every coach reads is the digest of all of
// them (memoryLines), sent with the training summary (lib/hercules-context.js), so the coach in
// the workout (Chiron) answers from what you said to Hercules and Athena too.
//
// The separate stores of older versions are folded in the first time the memory is read, and
// removed. Like before, the memory is not part of the training document: it stays on the device.

import { api } from './api.js'
import { getLang } from './i18n.js'

export const MAX_KEPT = 40       // messages kept per conversation
export const MAX_CHATS = 20      // conversations kept per coach
const LEGACY = ['hercules', 'athena']
const DAY = 86400000

const keyOf = uid => 'olympus_coach_memory_' + (uid || 'local')
const legacyKeyOf = (uid, coach) => 'olympus_' + coach + '_chats_' + (uid || 'local')
const oldestKeyOf = uid => 'olympus_hercules_' + (uid || 'local')

const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
const cleanMessages = v => (Array.isArray(v)
  ? v.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
  : [])
const cleanChat = (c, coach) => (c && typeof c.id === 'string'
  ? { id: c.id, coach: String(c.coach || coach || 'hercules'), ts: Number(c.ts) || 0, title: String(c.title || ''), messages: cleanMessages(c.messages) }
  : null)
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

function trim(mem) {
  const per = new Map()
  const chats = mem.chats
    .filter(c => c.messages.length)
    .sort((a, b) => b.ts - a.ts)
    .filter(c => { const n = per.get(c.coach) || 0; per.set(c.coach, n + 1); return n < MAX_CHATS })
    .map(c => ({ ...c, messages: c.messages.slice(-MAX_KEPT) }))
  return { v: 1, current: { ...mem.current }, chats }
}

/** The whole memory of profile `uid`, the stores of older versions folded in. */
export function loadMemory(uid) {
  const stored = read(keyOf(uid))
  const mem = {
    v: 1,
    current: stored?.current && typeof stored.current === 'object' && !Array.isArray(stored.current) ? { ...stored.current } : {},
    chats: Array.isArray(stored?.chats) ? stored.chats.map(c => cleanChat(c)).filter(Boolean) : [],
  }
  // Conversations kept per coach by older versions, and the single one before that.
  let migrated = false
  const ids = new Set(mem.chats.map(c => c.id))
  const legacy = [...LEGACY, ...ownCoachIds(uid)]
  for (const coach of legacy) {
    const old = read(legacyKeyOf(uid, coach))
    if (!old) continue
    migrated = true
    for (const c of (Array.isArray(old.chats) ? old.chats : [])) {
      const chat = cleanChat({ ...c, coach }, coach)
      if (chat && !ids.has(chat.id)) { mem.chats.push(chat); ids.add(chat.id) }
    }
    if (old.current && !(coach in mem.current)) mem.current[coach] = old.current
  }
  const oldest = cleanMessages(read(oldestKeyOf(uid)))
  if (oldest.length) {
    migrated = true
    if (!mem.chats.some(c => c.coach === 'hercules')) {
      const first = oldest.find(m => m.role === 'user')
      const id = newId()
      mem.chats.push({ id, coach: 'hercules', ts: oldest.at(-1)?.ts || Date.now(), messages: oldest, title: String(first?.content || '').slice(0, 48) })
      mem.current.hercules = mem.current.hercules || id
    }
  }
  if (migrated) {
    saveMemory(uid, mem)
    try {
      for (const coach of legacy) localStorage.removeItem(legacyKeyOf(uid, coach))
      localStorage.removeItem(oldestKeyOf(uid))
    } catch { /* the copy is in the shared memory already */ }
  }
  return mem
}

export function saveMemory(uid, mem) {
  try { localStorage.setItem(keyOf(uid), JSON.stringify(trim(mem))) } catch { /* the conversations are a convenience */ }
}

// The coaches of your own on this device (lib/own-coach.js keeps them), for their old stores.
function ownCoachIds(uid) {
  const v = read('olympus_own_coaches_' + (uid || 'local'))
  const list = Array.isArray(v) ? v : Array.isArray(v?.coaches) ? v.coaches : []
  return list.map(c => c?.id).filter(id => /^own_[a-z0-9]+$/.test(String(id)))
}

/** The conversations of one coach: { current, chats }, newest first. */
export function chatsOf(uid, coach) {
  const mem = loadMemory(uid)
  const chats = mem.chats.filter(c => c.coach === coach).sort((a, b) => b.ts - a.ts)
    .map(({ coach: _c, ...c }) => c)
  const current = chats.some(c => c.id === mem.current[coach]) ? mem.current[coach] : (chats[0]?.id || null)
  return { current, chats }
}

/** Replaces one coach's conversations with `data` ({ current, chats }), leaving the others alone. */
export function putChatsOf(uid, coach, data) {
  const mem = loadMemory(uid)
  mem.chats = [...mem.chats.filter(c => c.coach !== coach), ...(data.chats || []).map(c => ({ ...c, coach }))]
  mem.current = { ...mem.current, [coach]: data.current || null }
  saveMemory(uid, mem)
}

/** Forgets every conversation with `coach` (a coach of your own that was deleted). */
export function forgetCoach(uid, coach) {
  const mem = loadMemory(uid)
  mem.chats = mem.chats.filter(c => c.coach !== coach)
  delete mem.current[coach]
  saveMemory(uid, mem)
}

const NAMES = { hercules: 'Hercules', athena: 'Athena', chiron: 'Chiron' }
const clip = (s, n) => { const v = String(s || '').replace(/\s+/g, ' ').trim(); return v.length > n ? v.slice(0, n - 1).trimEnd() + '\u2026' : v }

/**
 * What the person told their coaches lately, for every coach to read: their own messages of the
 * last `days` days across all conversations, newest first, each cut short, at most `max` of them
 * and `budget` characters in all. [] when there is nothing. Only their words: the coaches'
 * answers are left out, as they were made from the same data the coach gets anyway.
 */
export function memoryLines(uid, { now = Date.now(), days = 45, max = 14, each = 200, budget = 1800, skipChat = null } = {}) {
  const mem = loadMemory(uid)
  const since = now - days * DAY
  const said = []
  for (const c of mem.chats) {
    if (c.id === skipChat) continue
    for (const m of c.messages) {
      const ts = Number(m.ts) || c.ts
      if (m.role === 'user' && ts >= since) said.push({ ts, coach: c.coach, text: m.content })
    }
  }
  said.sort((a, b) => b.ts - a.ts)
  const out = []
  let used = 0
  for (const s of said.slice(0, max)) {
    const line = `- ${new Date(s.ts).toISOString().slice(0, 10)}, to ${NAMES[s.coach] || 'their own coach'}: "${clip(s.text, each)}"`
    if (used + line.length > budget) break
    out.push(line); used += line.length
  }
  if (out.length) out.unshift('WHAT THEY TOLD THEIR COACHES RECENTLY (one memory shared by all coaches; their words, newest first; use it, do not repeat it back):')
  return out
}

// ---- Two memories --------------------------------------------------------------------------
// Their memory: short notes of what they said about themselves (goals, plans, limits, likes),
// which they can read, edit and delete (components/CoachGoals.jsx), and add to by hand. Notes
// they wrote or changed themselves are theirs: the distillation never rewrites them.
// The app's notes: what is read between the lines of their chats (api/hercules.js
// handleMemory) and of their numbers (dataNotes), never shown, used by every coach.
// Both stay on this device, like the conversations.
const notesKey = uid => 'olympus_memory_notes_' + (uid || 'local')
const hiddenKey = uid => 'olympus_memory_hidden_' + (uid || 'local')
const NOTE_MAX = 220
const cleanNote = v => String(v || '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX)
const noteId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

/** Their memory: [{ id, text, by: 'chat' | 'you', ts }], oldest first. */
export function loadNotes(uid) {
  const v = read(notesKey(uid))
  return (Array.isArray(v) ? v : []).filter(n => n && cleanNote(n.text))
    .map(n => ({ id: String(n.id || noteId()), text: cleanNote(n.text), by: n.by === 'you' ? 'you' : 'chat', ts: Number(n.ts) || 0 }))
}
export function saveNotes(uid, notes) {
  try { localStorage.setItem(notesKey(uid), JSON.stringify(notes.slice(-40))) } catch { /* a convenience */ }
}
/** Adds a note of their own; returns the list. */
export function addNote(uid, text, now = Date.now()) {
  const t = cleanNote(text)
  const notes = loadNotes(uid)
  if (t && !notes.some(n => n.text.toLowerCase() === t.toLowerCase())) notes.push({ id: noteId(), text: t, by: 'you', ts: now })
  saveNotes(uid, notes)
  return notes
}
/** Changes a note; changed, it is theirs. An empty text deletes it. */
export function editNote(uid, id, text, now = Date.now()) {
  const t = cleanNote(text)
  const notes = loadNotes(uid).flatMap(n => (n.id !== id ? [n] : t ? [{ ...n, text: t, by: 'you', ts: now }] : []))
  saveNotes(uid, notes)
  return notes
}
export const deleteNote = (uid, id) => editNote(uid, id, '')

/** The app's notes: { insights: [...], ts, upTo }, upTo the time of the last message read. */
export function loadHidden(uid) {
  const v = read(hiddenKey(uid))
  return { insights: Array.isArray(v?.insights) ? v.insights.map(cleanNote).filter(Boolean) : [], ts: Number(v?.ts) || 0, upTo: Number(v?.upTo) || 0 }
}
const saveHidden = (uid, h) => { try { localStorage.setItem(hiddenKey(uid), JSON.stringify(h)) } catch { /* a convenience */ } }

const WEEK = 7 * DAY
const kg = (n, unit) => `${Math.round(n * 10) / 10} ${unit}`
/**
 * What the numbers say, for the app's notes: the body-weight trend, how the most trained lifts
 * have moved over the last eight weeks (estimated one-rep max, Epley), and how often and how
 * long they train. Lines in English, [] without data.
 */
export function dataNotes(S, now = Date.now()) {
  if (!S) return []
  const unit = S.unit === 'lb' ? 'lb' : 'kg'
  const out = []
  const bw = S.bodyWeightOn === false ? [] : (S.bodyweight || []).filter(b => b && Number(b.w) > 0 && b.d)
  if (bw.length >= 2) {
    const last = bw.at(-1)
    const at = d => [...bw].reverse().find(b => Date.parse(b.d) <= now - d) || null
    const m1 = at(4 * WEEK), m3 = at(12 * WEEK)
    const ch = (a, label) => a && `${label} ${Number(last.w) - Number(a.w) >= 0 ? '+' : ''}${kg(Number(last.w) - Number(a.w), unit)}`
    const parts = [ch(m1, 'in 4 weeks'), ch(m3, 'in 12 weeks')].filter(Boolean)
    if (parts.length) out.push(`Body weight ${kg(Number(last.w), unit)}, ${parts.join(', ')}.`)
  }
  const ws = (S.workouts || []).filter(w => Number(w?.end) || Date.parse(w?.d || ''))
  const when = w => Number(w.end) || Number(w.start) || Date.parse(w.d)
  const recent = ws.filter(w => when(w) >= now - 8 * WEEK)
  if (recent.length) {
    const mins = recent.map(w => (Number(w.end) && Number(w.start) ? (w.end - w.start) / 60000 : 0)).filter(m => m > 5 && m < 400)
    out.push(`Trains ${Math.round(recent.length / 8 * 10) / 10} times a week over the last 8 weeks${mins.length ? `, about ${Math.round(mins.reduce((a, b) => a + b, 0) / mins.length)} min a session` : ''}.`)
  }
  // Best estimated 1RM per exercise in the first and the last four of those eight weeks.
  const best = new Map()
  for (const w of recent) {
    const half = when(w) >= now - 4 * WEEK ? 1 : 0
    for (const e of w.entries || []) for (const s of e.sets || []) {
      const wt = Number(s.w), r = Number(s.r)
      if (!s.done || !(wt > 0) || !(r > 0) || r > 15) continue
      const est = wt * (1 + r / 30)
      const v = best.get(e.id) || { n: 0, b: [0, 0] }
      v.n++; v.b[half] = Math.max(v.b[half], est)
      best.set(e.id, v)
    }
  }
  const lifts = [...best.entries()].filter(([, v]) => v.b[0] && v.b[1]).sort((a, b) => b[1].n - a[1].n).slice(0, 5)
  if (lifts.length) {
    out.push('Estimated 1RM, earlier 4 weeks to the last 4: ' + lifts.map(([id, v]) => {
      const pct = Math.round((v.b[1] / v.b[0] - 1) * 100)
      return `${id} ${kg(v.b[0], unit)} to ${kg(v.b[1], unit)} (${pct >= 0 ? '+' : ''}${pct}%)`
    }).join('; ') + '.')
  }
  return out
}

/**
 * Both memories, as the lines every coach reads with the training summary. `big` (Chiron, who
 * has fewer messages and more room for each) sends more of what they said lately too.
 */
export function memoryContext(uid, S, { now = Date.now(), big = false, skipChat = null } = {}) {
  const notes = loadNotes(uid)
  const hidden = loadHidden(uid)
  const data = dataNotes(S, now)
  const out = []
  if (notes.length) out.push('THEIR MEMORY (what they told their coaches about themselves; they can read and edit it):', ...notes.map(n => '- ' + n.text))
  if (hidden.insights.length || data.length) out.push("THE APP'S NOTES ABOUT THEM (drawn from their chats and their data; use them to fit the advice, never quote or mention them):", ...hidden.insights.map(i => '- ' + i), ...data.map(d => '- ' + d))
  out.push(...memoryLines(uid, big ? { now, days: 180, max: 60, each: 300, budget: 12000, skipChat } : { now, skipChat }))
  return out
}

let distilling = null
/**
 * Brings both memories up to date with what was said since the last time, through the server
 * (api/hercules.js handleMemory), when there is enough new: two messages, half an hour after the
 * last update, or eight at once. Quiet on any failure: the memory is a help, never in the way.
 */
export function distillMemory(uid, S, { now = Date.now(), force = false } = {}) {
  if (distilling) return distilling
  const hidden = loadHidden(uid)
  const mem = loadMemory(uid)
  const fresh = []
  for (const c of mem.chats) for (const m of c.messages) {
    const ts = Number(m.ts) || c.ts
    if (m.role === 'user' && ts > hidden.upTo) fresh.push({ ts, coach: NAMES[c.coach] || 'own coach', content: String(m.content).slice(0, 400) })
  }
  fresh.sort((a, b) => a.ts - b.ts)
  const ripe = force ? fresh.length > 0 : fresh.length >= 8 || (fresh.length >= 2 && now - hidden.ts > 30 * 60000)
  if (!ripe) return Promise.resolve(false)
  const notes = loadNotes(uid)
  const sent = fresh.slice(-60)
  distilling = api('/api/coach/memory', {
    method: 'POST',
    body: JSON.stringify({ messages: sent.map(({ coach, content }) => ({ coach, content })), notes: notes.map(n => n.text), insights: hidden.insights, data: dataNotes(S, now).join('\n'), lang: getLang() }),
  }).then(r => {
    const theirs = loadNotes(uid).filter(n => n.by === 'you')
    const own = new Set(theirs.map(n => n.text.toLowerCase()))
    const before = new Map(loadNotes(uid).map(n => [n.text.toLowerCase(), n]))
    const fromChat = (r?.notes || []).map(cleanNote).filter(t => t && !own.has(t.toLowerCase()))
      .map(t => before.get(t.toLowerCase()) || { id: noteId(), text: t, by: 'chat', ts: now })
    saveNotes(uid, [...theirs, ...fromChat].sort((a, b) => a.ts - b.ts))
    saveHidden(uid, { insights: (r?.insights || []).map(cleanNote).filter(Boolean), ts: now, upTo: sent.at(-1).ts })
    return true
  }, () => false).finally(() => { distilling = null })
  return distilling
}
