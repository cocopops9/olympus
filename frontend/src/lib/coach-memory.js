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
