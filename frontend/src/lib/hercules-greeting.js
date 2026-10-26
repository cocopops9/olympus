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
export function greetingFor(S, today = todayISO(), first = false, name = 'Hercules', coach = 'hercules') {
  const days = (S?.workouts || []).map(w => w?.d).filter(Boolean).sort()
  const last = days.at(-1)
  if (first || !last) {
    return { kind: 'hello', text: coach === 'athena'
      ? t('Hi, I am Athena, your AI strategist. I read your training data and plan your progress: tap me whenever you want an analysis.')
      : t('Hi, I am {0}, your AI coach. Tap me whenever you need help.', name) }
  }
  if (last === today) return { kind: 'done', text: t('Nice workout today! Want my feedback on it?'), ask: t('Give me feedback on my workout today') }
  if (dayMs(today) - dayMs(last) >= IDLE_DAYS * DAY) return { kind: 'idle', text: t("Ready to train? I can plan today's session for you."), ask: t('Plan my session for today') }
  return { kind: 'tip', text: coach === 'athena' ? t('Want to know what your numbers say? Ask me.') : t('Questions about technique, nutrition or recovery? Ask me.') }
}

/**
 * The greeting to show now for profile `uid`, or null when there is none: which coach says it
 * ({ coach, kind, text, ask }). Each coach in `coaches` introduces herself or himself once, the
 * first time there is a chance, even on a day another coach already spoke; after that one coach
 * speaks a day, taking turns. Showing it is recorded.
 */
export function takeGreeting(uid, S, today = todayISO(), { coaches = ['hercules'], names = {} } = {}) {
  let seen = null
  try { seen = JSON.parse(localStorage.getItem(keyOf(uid)) || 'null') } catch { seen = null }
  // Older versions kept only the day: Hercules had said hello then.
  const hello = Array.isArray(seen?.hello) ? seen.hello : seen ? ['hercules'] : []
  const save = v => { try { localStorage.setItem(keyOf(uid), JSON.stringify(v)) } catch { /* shown again at worst */ } }
  const fresh = coaches.find(c => !hello.includes(c))
  if (fresh) {
    save({ day: today, hello: [...hello, fresh] })
    return { coach: fresh, ...greetingFor(S, today, true, names[fresh] || 'Hercules', fresh) }
  }
  if (seen?.day === today || !coaches.length) return null
  const coach = coaches[Math.floor(dayMs(today) / DAY) % coaches.length]
  save({ day: today, hello })
  return { coach, ...greetingFor(S, today, false, names[coach] || 'Hercules', coach) }
}
