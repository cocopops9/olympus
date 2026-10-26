import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import Elapsed from './Elapsed.jsx'
import { isPaused } from '../lib/workout-clock.js'
import { useConnectionTrouble } from './SyncBanner.jsx'
import { useSocial } from '../store/useSocial.js'

// Module scope, not TabBar's render body. Declared inside it, `Tab` was a new function on every
// render, so React saw a different component type each time and threw the button away and built a
// fresh one — on a bar that is fixed on screen, and once a second for the whole of a rest. The
// state it took with it is the DOM node itself: focus, the :active tint, any in-flight transition.
// `dot`: a connection problem (Profile). `badge`: unread notifications (Home), a count.
function Tab({ active, icon, label, onClick, dot, badge }) {
  const said = dot ? label + ', ' + t('Connection problem') : badge ? label + ', ' + t('New notifications') : undefined
  return (
    <button className={active ? 'on' : ''} onClick={onClick} aria-label={said}>
      <span className="tab-ic"><Icon name={icon} />{dot && <span className="tab-dot" aria-hidden="true" />}
        {!dot && badge > 0 && <span className="tab-badge" aria-hidden="true">{badge > 9 ? '9+' : badge}</span>}</span><span>{label}</span>
    </button>
  )
}

export default function TabBar({ onStart }) {
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const isGuest = useStore(s => s.isGuest())
  // With the connection banner switched off, a sync problem shows as a dot on Profile (below).
  const trouble = useConnectionTrouble()
  const news = useSocial(s => s.unread + s.requests)
  if (!user && !isGuest) return null
  const cur = loc.pathname.split('/')[1] || 'home'
  // Three tabs (Olympus): Home is the feed and the profiles it links to; Profile is everything
  // about your own training — calendar, stats, body, and the screens reached from it.
  const HOME = new Set(['home', 'u', 'notifications', 'post'])
  const PROFILE = new Set(['profile', 'today', 'stats', 'history', 'measurements', 'progress-photos', 'muscles',
    'structural-balance', 'plan', 'library', 'settings', 'checkin', 'coach', 'admin'])
  const on = k => (k === 'home' ? HOME.has(cur) : k === 'profile' ? PROFILE.has(cur) : cur === k)

  const running = !!S.active && cur !== 'workout' && !S.active.editingWorkoutId && !S.active.backfill && S.active.start > 0
  const startWorkout = () => {
    // Olympus: no session running opens the Workout screen (views/WorkoutStart.jsx), where today's
    // routine is the first card with its Start button, rather than starting it on the spot.
    nav('/workout')
  }

  return (
    <nav id="tabbar">
      <Tab active={on('home')} icon="house" label={t('Home')} badge={news} onClick={() => nav('/home')} />
      {/* Workout: the start button it always was. On the workout screen itself there is nothing
          to resume, so it reads as the tab it is and stays lit (#29); anywhere else it brings you
          back to the exercise you were on — the marker is kept in S.active.cur and never moves on
          its own (#21). The glyph is always play: start and resume are one concept. A live session
          you stepped away from shows its running time instead of a word, the button still named
          Resume; a past workout being edited or logged after the fact has no clock to run. */}
      <button className={'start' + (S.active ? ' rec' : '') + (S.active && cur === 'workout' ? ' on' : '')} onClick={startWorkout}
        aria-label={running ? t('Resume') : undefined}>
        {/* Paused (lib/workout-clock.js), the button says so: the pause glyph instead of play. */}
        <span className="cir"><Icon name={running && isPaused(S.active) ? 'pause' : 'play'} /></span>
        {running ? <span className="tab-time"><Elapsed active={S.active} /></span>
          : <span>{S.active ? (cur === 'workout' ? t('Workout') : S.active.editingWorkoutId ? t('Edit workout') : t('Resume')) : t('Workout')}</span>}
      </button>
      {/* With the connection banner switched off, a sync problem shows as a dot on Profile, the
          tab Settings lives under (#369, #330). */}
      <Tab active={on('profile')} icon="person" label={t('Profile')} dot={trouble} onClick={() => nav('/profile')} />
    </nav>
  )
}
