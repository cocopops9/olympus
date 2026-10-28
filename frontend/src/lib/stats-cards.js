// Olympus: which statistics the Stats page shows, and in what order (components/StatsPicker.jsx
// edits it). The choice is part of the training document (S.statsCards), so it follows the
// profile to every device. null means "never chosen": a short default set, so the page opens on
// what most people look at and the rest waits in the picker instead of stacking up underneath.
import { t } from './i18n.js'

/** Every card the Stats page can show, in the default order. Labels are functions: they follow the language. */
export const STATS_CARDS = [
  { id: 'highlights', icon: 'sparkles', tone: 'yellow', name: () => t('Highlights'), desc: () => t('What your training adds up to, in a sentence each') },
  { id: 'summary', icon: 'trophy', tone: 'orange', name: () => t('Summary'), desc: () => t('Workouts, this month, week streak and PRs') },
  { id: 'activity', icon: 'calendar', tone: 'green', name: () => t('Activity'), desc: () => t('A year of training, day by day') },
  { id: 'progress', icon: 'chartLine', tone: 'blue', name: () => t('Exercise progress'), desc: () => t('Top set, estimated 1RM and every set, per exercise') },
  { id: 'muscles', icon: 'figureStrength', tone: 'pink', name: () => t('Muscle balance'), desc: () => t('Which muscles you train, their fatigue and strength') },
  { id: 'weekly', icon: 'chart', tone: 'purple', name: () => t('Weekly muscle volume'), desc: () => t('Sets per muscle in your weekly plan') },
  { id: 'effort', icon: 'gauge', tone: 'yellow', name: () => t('Effort'), desc: () => t('How close to failure you train') },
  { id: 'structural', icon: 'layout', tone: 'teal', name: () => t('Structural balance'), desc: () => t('Which lift is holding back the rest') },
  { id: 'photos', icon: 'image', tone: 'indigo', name: () => t('Progress photos'), desc: () => t('Your workout photos by date, with a before and after') },
  { id: 'recent', icon: 'history', tone: 'mint', name: () => t('Recent workouts'), desc: () => t('Your last six sessions') },
]
export const STATS_IDS = STATS_CARDS.map(c => c.id)
export const statsCard = id => STATS_CARDS.find(c => c.id === id) || null

/** The cards shown when nothing was chosen. Effort joins when the profile logs effort at all. */
export function defaultStatsCards(S) {
  const logsEffort = S?.effort === 'rir' || S?.effort === 'rpe' || (S?.effort == null && S?.showRir === true)
  return ['highlights', 'summary', 'activity', 'progress', 'muscles', 'weekly', ...(logsEffort ? ['effort'] : []), 'structural', 'recent']
}

// How much each card shows (S.statsDetail): 'simple' — the headline figure, one chart and what it
// means, in words — or 'detailed', every view, toggle and number. null = never chosen, which reads
// as simple: the page should be readable to anyone the first time, and one tap opens it up.
export const STATS_DETAIL = ['simple', 'detailed']
export const statsDetailOf = S => (S?.statsDetail === 'detailed' ? 'detailed' : 'simple')

/** The ids the Stats page shows, in order: the saved choice (unknown ids dropped), or the default. */
export function statsCardsOf(S) {
  const saved = S?.statsCards
  if (!Array.isArray(saved)) return defaultStatsCards(S)
  return [...new Set(saved.filter(id => STATS_IDS.includes(id)))]
}

/** `list` with `id` switched on (added at the end) or off. */
export const toggleCard = (list, id) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id])

/** `list` with the card at `from` moved to `to` (both indexes in `list`). */
export function moveCard(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = list.slice()
  const [id] = next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}
