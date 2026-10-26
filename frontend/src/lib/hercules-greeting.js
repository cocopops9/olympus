// Olympus: what Hercules says from his portrait, now and then, in a speech bubble
// (components/Hercules.jsx). At most once a day per profile, and always the first time he
// appears. The line depends on the person's training: a workout done today, a few days without
// one, or nothing logged yet.
import { t } from './i18n.js'
import { todayISO } from './format.js'

const DAY = 86400000
const IDLE_DAYS = 4
const keyOf = uid => 'olympus_hercules_greet_' + (uid || 'local')
const dayMs = iso => new Date(iso + 'T12:00:00').getTime()

/** The line for training document `S` on day `today`, and what tapping it should ask. */
export function greetingFor(S, today = todayISO(), first = false, name = 'Hercules') {
  const days = (S?.workouts || []).map(w => w?.d).filter(Boolean).sort()
  const last = days.at(-1)
  if (first || !last) return { kind: 'hello', text: t('Hi, I am {0}, your AI coach. Tap me whenever you need help.', name) }
  if (last === today) return { kind: 'done', text: t('Nice workout today! Want my feedback on it?'), ask: t('Give me feedback on my workout today') }
  if (dayMs(today) - dayMs(last) >= IDLE_DAYS * DAY) return { kind: 'idle', text: t("Ready to train? I can plan today's session for you."), ask: t('Plan my session for today') }
  return { kind: 'tip', text: t('Questions about technique, nutrition or recovery? Ask me.') }
}

/**
 * The greeting to show now for profile `uid`, or null when one was already shown today.
 * Showing it is recorded, so the next call the same day returns null.
 */
export function takeGreeting(uid, S, today = todayISO(), name = 'Hercules') {
  let seen = null
  try { seen = JSON.parse(localStorage.getItem(keyOf(uid)) || 'null') } catch { seen = null }
  if (seen?.day === today) return null
  try { localStorage.setItem(keyOf(uid), JSON.stringify({ day: today })) } catch { /* shown again tomorrow at worst */ }
  return greetingFor(S, today, !seen, name)
}
