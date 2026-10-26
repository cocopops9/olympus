// Olympus: talking to the coaches, Hercules and Athena (api/hercules.js), and the conversations kept on
// this device. Each coach has her or his own conversations and her or his own messages for the day.
//
// Conversations are not part of the training document: they stay on the device, per profile,
// up to MAX_CHATS of them with the last MAX_KEPT messages each, so they are there when the chat
// is opened again. Stored as { current: id, chats: [{ id, title, ts, messages }] }, newest first.
// The single conversation older versions kept (olympus_hercules_<uid>) becomes the first one.
import { api } from './api.js'
import { getLang } from './i18n.js'
import { useStore } from '../store/useStore.js'
import { herculesContext } from './hercules-context.js'

const MAX_KEPT = 40
const MAX_CHATS = 20
const TITLE_LEN = 48
const ANSWER_MS = 75000   // the model, and its fallback when the first is busy

export const COACH_IDS = ['hercules', 'athena']
const coachOf = id => (COACH_IDS.includes(id) ? id : 'hercules')
const oldKeyOf = uid => 'olympus_hercules_' + (uid || 'local')
const keyOf = (uid, coach = 'hercules') => 'olympus_' + coachOf(coach) + '_chats_' + (uid || 'local')
const lastKeyOf = uid => 'olympus_coach_last_' + (uid || 'local')

/** The coach this profile talked to last (the one on the button), or null. */
export function lastCoach(uid) {
  try { const v = localStorage.getItem(lastKeyOf(uid)); return COACH_IDS.includes(v) ? v : null } catch { return null }
}
export function setLastCoach(uid, coach) {
  try { localStorage.setItem(lastKeyOf(uid), coachOf(coach)) } catch { /* the button shows Hercules again */ }
}

const cleanMessages = v => (Array.isArray(v)
  ? v.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
  : [])

/** The title of a conversation: its first question, cut short. */
export function chatTitle(messages) {
  const first = messages.find(m => m.role === 'user')
  const text = String(first?.content || '').replace(/\s+/g, ' ').trim()
  return text.length > TITLE_LEN ? text.slice(0, TITLE_LEN - 1).trimEnd() + '\u2026' : text
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

/** All the conversations of profile `uid` with `coach`: { current, chats }. */
export function loadChats(uid, coach = 'hercules') {
  let data = null
  try { data = JSON.parse(localStorage.getItem(keyOf(uid, coach)) || 'null') } catch { data = null }
  let chats = Array.isArray(data?.chats)
    ? data.chats.filter(c => c && typeof c.id === 'string').map(c => ({
      id: c.id, ts: Number(c.ts) || 0, messages: cleanMessages(c.messages), title: String(c.title || ''),
    }))
    : []
  if (!data && coachOf(coach) === 'hercules') {
    // The one conversation an older version kept.
    let old = []
    try { old = cleanMessages(JSON.parse(localStorage.getItem(oldKeyOf(uid)) || '[]')) } catch { old = [] }
    if (old.length) chats = [{ id: newId(), ts: old.at(-1)?.ts || Date.now(), messages: old, title: chatTitle(old) }]
  }
  const current = chats.some(c => c.id === data?.current) ? data.current : (chats[0]?.id || null)
  return { current, chats }
}

export function saveChats(uid, data, coach = 'hercules') {
  const chats = data.chats
    .filter(c => c.messages.length)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_CHATS)
    .map(c => ({ ...c, messages: c.messages.slice(-MAX_KEPT) }))
  try {
    localStorage.setItem(keyOf(uid, coach), JSON.stringify({ current: data.current, chats }))
    if (coachOf(coach) === 'hercules') localStorage.removeItem(oldKeyOf(uid))
  } catch { /* the conversations are a convenience */ }
}

/** `data` with the conversation `id` holding `messages` (a new one when `id` is null). */
export function putChat(data, id, messages) {
  const cid = id || newId()
  const rest = data.chats.filter(c => c.id !== cid)
  const chat = { id: cid, ts: Date.now(), messages, title: chatTitle(messages) }
  return { current: cid, chats: [chat, ...rest] }
}

/** `data` without the conversation `id`. */
export function dropChat(data, id) {
  const chats = data.chats.filter(c => c.id !== id)
  return { current: data.current === id ? null : data.current, chats }
}

/** { on, perDay, left } for `coach` */
export const herculesStatus = (coach = 'hercules') => api('/api/' + coachOf(coach))

/** Sends the conversation (ending with the new message) to `coach`; resolves with { reply, left, perDay }. */
export function askHercules(list, coach = 'hercules') {
  const S = useStore.getState().S
  const messages = list.map(m => ({ role: m.role, content: m.content }))
  return api('/api/' + coachOf(coach), {
    method: 'POST',
    timeout: ANSWER_MS,
    body: JSON.stringify({ messages, lang: getLang(), context: herculesContext(S) }),
  })
}
