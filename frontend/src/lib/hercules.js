// Olympus: talking to the coaches, Hercules and Athena (api/hercules.js), Chiron in the workout,
// and the conversations kept on this device. Each coach has her or his own messages for the day.
//
// Conversations are not part of the training document: they stay on the device, per profile, in
// the one memory every coach shares (lib/coach-memory.js), up to MAX_CHATS per coach with the last
// MAX_KEPT messages each, so they are there when the chat is opened again. Each coach lists its
// own; every coach reads a digest of all of them with the training summary.
import { api } from './api.js'
import { getLang } from './i18n.js'
import { useStore } from '../store/useStore.js'
import { herculesContext } from './hercules-context.js'
import { chatsOf, putChatsOf, memoryLines } from './coach-memory.js'

const TITLE_LEN = 48
const ANSWER_MS = 75000   // the model, and its fallback when the first is busy

export const COACH_IDS = ['hercules', 'athena']
// Chiron only coaches during a workout (components/Chiron.jsx): not one of the chat's coaches.
export const WORKOUT_COACH = 'chiron'
// Hercules, Athena, Chiron, or a coach of your own (lib/own-coach.js, ids own_...).
const coachOf = id => (COACH_IDS.includes(id) || id === WORKOUT_COACH || /^own_[a-z0-9]+$/.test(String(id)) ? id : 'hercules')
const lastKeyOf = uid => 'olympus_coach_last_' + (uid || 'local')

/** The coach this profile talked to last (the one on the button), or null. */
export function lastCoach(uid) {
  try { const v = localStorage.getItem(lastKeyOf(uid)); return v && v !== WORKOUT_COACH && coachOf(v) === v ? v : null } catch { return null }
}
export function setLastCoach(uid, coach) {
  if (coach === WORKOUT_COACH) return
  try { localStorage.setItem(lastKeyOf(uid), coachOf(coach)) } catch { /* the button shows Hercules again */ }
}

/** The title of a conversation: its first question, cut short. */
export function chatTitle(messages) {
  const first = messages.find(m => m.role === 'user')
  const text = String(first?.content || '').replace(/\s+/g, ' ').trim()
  return text.length > TITLE_LEN ? text.slice(0, TITLE_LEN - 1).trimEnd() + '\u2026' : text
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

/** All the conversations of profile `uid` with `coach`: { current, chats }. */
export const loadChats = (uid, coach = 'hercules') => chatsOf(uid, coachOf(coach))

export const saveChats = (uid, data, coach = 'hercules') => putChatsOf(uid, coachOf(coach), data)

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
export function askHercules(list, coach = 'hercules', opts = {}) {
  const S = useStore.getState().S
  const messages = list.map(m => ({ role: m.role, content: m.content }))
  return api('/api/' + coachOf(coach), {
    method: 'POST',
    timeout: ANSWER_MS,
    // The memory every coach shares rides with the summary; the conversation in hand is sent as
    // messages already.
    body: JSON.stringify({ messages, lang: getLang(), context: herculesContext(S, undefined, { memory: memoryLines(useStore.getState().user?.id, { skipChat: opts.chatId }) }) }),
  })
}
