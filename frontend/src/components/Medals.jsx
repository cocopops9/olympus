// Olympus: medals (lib/medals.js). The medal itself, the screen with all of them (/medals), the
// card on the Profile, and the celebration: when a medal is earned it bursts onto the screen with
// the fanfare, once, whatever earned it (a workout finished, a friend who joined, a story shared).
//
// The counters behind the social medals live in S.medals: { got: { id: time celebrated },
// invites, stories, invited, posts, followers }; the last three are the server's numbers, kept so
// the medals read the same offline. The medals of "Your goals" read what the person told their
// coaches (their goals in S.coachProfile and the notes in lib/coach-memory.js). An administrator
// can switch the screen to the catalogue of every medal of the app; nobody else is offered it.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { fmtDate, fmtNum } from '../lib/format.js'
import { medalsOf, allMedals, newlyEarned, nextMedal, TIERS } from '../lib/medals.js'
import { loadNotes } from '../lib/coach-memory.js'
import { socialReady } from '../lib/social.js'
import { fetchReferral } from '../lib/referral.js'
import { shareStory } from '../lib/story-card.js'
import { triumph } from '../lib/sound.js'
import { MOBILE } from '../lib/mobile.js'
import { inviteSheet } from './Community.jsx'
import { coachGoalsSheet } from './CoachGoals.jsx'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import '../medals.css'

const update = (...a) => useStore.getState().update(...a)

/** Adds one to a medal counter (invites, stories) in the training document. */
export function bumpMedal(key) {
  update(s => { s.medals = { ...(s.medals || {}), [key]: (Number(s.medals?.[key]) || 0) + 1 } })
}

/** Keeps the server's numbers (invited, posts, followers) where the medals read them. */
export function rememberSocial(nums) {
  const S = useStore.getState().S
  const cur = S.medals || {}
  const next = {}
  for (const k of ['invited', 'posts', 'followers']) if (nums?.[k] != null && Number(nums[k]) !== Number(cur[k])) next[k] = Number(nums[k]) || 0
  if (Object.keys(next).length) update(s => { s.medals = { ...(s.medals || {}), ...next } })
}

const social = S => ({ invited: S.medals?.invited, posts: S.medals?.posts })

/** The medals of `S` for profile `uid`: the notes the coaches keep are read for goals. */
const medalsFor = (S, uid, opts = {}) => medalsOf(S, social(S), Date.now(), { notes: loadNotes(uid).map(n => n.text), ...opts })

/** The medal: a disc of the tier's metal on a ribbon, the medal's sign in the middle. */
export function MedalBadge({ m, size = 64, glow = false }) {
  return <span className={'mdl t-' + m.tier + (m.earned ? '' : ' locked') + (glow ? ' glow' : '')} style={{ '--s': size + 'px' }} aria-hidden="true">
    <span className="mdl-rib" />
    <span className="mdl-disc"><Icon name={m.icon || 'medal'} /></span>
  </span>
}

const tierName = tier => ({ bronze: t('Bronze'), silver: t('Silver'), gold: t('Gold'), platinum: t('Platinum'), olympian: t('Olympian') }[tier] || tier)

function MedalDetail({ m, close }) {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const st = useStore(s => s.S)
  const toast = useUI(s => s.toast)
  const social = m.group === 'social'
  const last = (st.workouts || [])[st.workouts.length - 1]
  const story = async () => {
    const how = await shareStory(last, { unit: st.unit, mobile: MOBILE })
    if (how === 'shared' || how === 'saved') { bumpMedal('stories'); toast(t('Shared!')) }
    else if (how === 'failed') toast(t('Could not share the image.'))
  }
  return <div className="mdl-detail">
    <MedalBadge m={m} size={120} glow={m.earned} />
    <div className="mdl-tier">{tierName(m.tier)}</div>
    <h3>{m.title}</h3>
    <p className="muted">{m.desc}</p>
    {m.fun && <p className="mdl-fun">{m.fun}</p>}
    {m.earned
      ? <p className="small accent">{m.at ? t('Earned on {0}', fmtDate(m.at, true, true)) : t('Earned')}</p>
      : <>
        <div className="mdl-bar"><i style={{ width: Math.round(m.progress * 100) + '%' }} /></div>
        <p className="small muted">{t('{0}% of the way', Math.floor(m.progress * 100))}</p>
      </>}
    {social && m.id.startsWith('invite') && socialReady(user) && <Button variant="primary" icon="person" onClick={() => { close(); inviteSheet() }}>{t('Invite friends')}</Button>}
    {social && m.id.startsWith('stories') && last && <Button variant="primary" icon="camera" onClick={story}>{t('Share to your story')}</Button>}
    {social && m.id.startsWith('posts') && <Button variant="primary" icon="share" onClick={() => { close(); nav('/profile?tab=posts') }}>{t('Share a workout')}</Button>}
    {m.group === 'goals' && <Button variant="tinted" icon="target" onClick={() => { close(); coachGoalsSheet() }}>{t('Edit goals')}</Button>}
    <div style={{ height: 8 }} />
    <Button onClick={close}>{t('Close')}</Button>
  </div>
}
export const medalSheet = m => useUI.getState().openSheet(close => <MedalDetail m={m} close={close} />, { kind: 'center' })

/* ---------------------------- celebration ---------------------------- */

let showCelebration = null

/** Celebrates `list` (medals) now, one after the other. Nothing when the celebration is not mounted. */
export const celebrate = list => showCelebration?.(list)

/*
 * How a medal is celebrated grows with its tier, and none of it has to be answered: it plays and
 * leaves by itself, a tap sends it away sooner, and a tap on the medal opens what it is.
 *   bronze, silver   a small banner slides in at the top (silver with a glint)
 *   gold             the banner, and a short fall of confetti
 *   platinum         the medal takes the middle of the screen, with rays and confetti
 *   olympian         the same, larger: a flash, a shockwave, two wheels of rays, a golden rain
 * `stay` is how long it stays, in milliseconds; `confetti` how many pieces fall.
 */
export const CELEBRATION = {
  bronze: { kind: 'banner', stay: 3200, confetti: 0, sound: false },
  silver: { kind: 'banner', stay: 3800, confetti: 0, sound: false },
  gold: { kind: 'banner', stay: 4600, confetti: 22, sound: true },
  platinum: { kind: 'stage', stay: 5200, confetti: 44, sound: true },
  olympian: { kind: 'stage', stay: 7000, confetti: 84, sound: true },
}
export const celebrationOf = m => CELEBRATION[m?.tier] || CELEBRATION.bronze

const CONFETTI = ['#f2b51c', '#ffe08a', '#ffffff', '#ff9f0a', '#c98c0a']

/** The celebration of the medals just earned, one after the other (see CELEBRATION). */
export function MedalCelebration() {
  const [queue, setQueue] = useState([])
  const sound = useStore(s => s.S.sound)
  useEffect(() => {
    showCelebration = list => setQueue(q => [...q, ...list])
    // The browser demo shows the celebration on demand (for screenshots and tests).
    if (import.meta.env.VITE_DEMO === '1') window.__medalBurst = () => setQueue(allMedals(medalsOf(useStore.getState().S, {})).filter(x => x.earned && x.fun).slice(-2))
    return () => { showCelebration = null }
  }, [])
  const m = queue[0]
  const how = celebrationOf(m)
  const next = () => setQueue(q => q.slice(1))
  useEffect(() => {
    if (!m) return
    if (how.sound) triumph(sound)
    const tm = setTimeout(next, how.stay)
    return () => clearTimeout(tm)
  }, [m?.id])   // eslint-disable-line react-hooks/exhaustive-deps
  const confetti = useMemo(() => Array.from({ length: how.confetti }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * (how.kind === 'stage' ? 1.2 : 0.5), dur: 1.8 + Math.random() * 1.8, rot: Math.random() * 360,
    color: CONFETTI[i % CONFETTI.length],
  })), [m?.id])   // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return null
  const open = e => { e.stopPropagation(); setQueue([]); medalSheet(m) }
  const fall = how.confetti > 0 && <div className="mdl-confetti" aria-hidden="true">{confetti.map((c, i) => <i key={i} style={{ left: c.left + '%', animationDelay: c.delay + 's', animationDuration: c.dur + 's', background: c.color, transform: `rotate(${c.rot}deg)` }} />)}</div>
  const more = queue.length - 1

  if (how.kind === 'banner') return <div className={'mdl-cele mdl-cele-banner tier-' + m.tier} key={m.id} role="status" aria-live="polite" style={{ '--stay': how.stay + 'ms' }}>
    {fall}
    <button type="button" className="mdl-banner" onClick={open}>
      <MedalBadge m={m} size={52} glow />
      <span className="mdl-banner-t">
        <span className="mdl-burst-k">{t('New medal!')}{more > 0 ? ' +' + more : ''}</span>
        <b>{m.title}</b>
        <span className="mdl-banner-s">{tierName(m.tier)}{m.fun ? ' · ' + m.fun : ''}</span>
      </span>
      <span className="mdl-banner-x" role="button" aria-label={t('Close')} onClick={e => { e.stopPropagation(); next() }}><Icon name="xmark" /></span>
    </button>
  </div>

  return <div className={'mdl-cele mdl-cele-stage tier-' + m.tier} key={m.id} role="status" aria-live="polite" style={{ '--stay': how.stay + 'ms' }} onClick={next}>
    <div className="mdl-stage-glow" aria-hidden="true" />
    {m.tier === 'olympian' && <div className="mdl-stage-flash" aria-hidden="true" />}
    {fall}
    <div className="mdl-stage">
      <div className="mdl-stage-medal" onClick={open}>
        <span className="mdl-rays" aria-hidden="true" />
        {m.tier === 'olympian' && <span className="mdl-rays two" aria-hidden="true" />}
        {m.tier === 'olympian' && <span className="mdl-shock" aria-hidden="true" />}
        <MedalBadge m={m} size={m.tier === 'olympian' ? 172 : 148} glow />
      </div>
      <div className="mdl-burst-k">{t('New medal!')}{more > 0 ? ' +' + more : ''}</div>
      <div className="mdl-tier">{tierName(m.tier)}</div>
      <h2>{m.title}</h2>
      {m.fun ? <p className="mdl-fun big">{m.fun}</p> : <p className="mdl-stage-d">{m.desc}</p>}
    </div>
  </div>
}

/**
 * Watches the training and the counters for medals not celebrated yet and celebrates them. The
 * first time it runs on a device with history, what was earned before is marked without a show.
 */
export function useMedalWatcher(ready) {
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const timer = useRef(null)
  useEffect(() => {
    if (!ready || S.active) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const groups = medalsFor(S, user?.id)
      const got = S.medals?.got
      const fresh = newlyEarned(groups, got || {})
      if (!fresh.length) return
      const now = Date.now()
      update(s => { s.medals = { ...(s.medals || {}), got: { ...(s.medals?.got || {}), ...Object.fromEntries(fresh.map(m => [m.id, now])) } } })
      // Only what was just earned bursts onto the screen: a history that arrives from the server
      // (a sign-in on a new phone) is marked without a show.
      const recent = iso => !iso || (now - new Date(String(iso).slice(0, 10) + 'T12:00:00').getTime()) < 3 * 86400000
      if (got) showCelebration?.(fresh.filter(m => recent(m.at)).slice(0, 4))
    }, 1500)
    return () => clearTimeout(timer.current)
  }, [ready, S.workouts, S.medals, S.active, S.bodyweight, S.birth, S.body, S.coachProfile, S.unit, user?.id])
  // The friends who joined: the server's count, asked once per start.
  useEffect(() => {
    if (!ready || !socialReady(user)) return
    fetchReferral().then(d => rememberSocial({ invited: d?.invited }), () => {})
  }, [ready, user?.id])
}

/* ------------------------------ the card ----------------------------- */

/** On the Profile's Overview: how many medals, the newest and the next one. */
export function MedalsCard() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const uid = useStore(s => s.user?.id)
  const groups = useMemo(() => medalsFor(S, uid), [S, uid])
  const all = allMedals(groups)
  const earned = all.filter(m => m.earned)
  const next = nextMedal(groups)
  const recent = [...earned].sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 4)
  return <button className="ov-card mdl-card" onClick={() => nav('/medals')}>
    <div className="row between" style={{ alignItems: 'center' }}>
      <h3 style={{ margin: 0 }}>{t('Medals')}</h3>
      <span className="mdl-count">{fmtNum(earned.length)}<small> / {fmtNum(all.length)}</small></span>
    </div>
    <div className="mdl-row">{recent.length ? recent.map(m => <MedalBadge key={m.id} m={m} size={46} />) : <span className="small muted">{t('Finish a workout to earn your first medal.')}</span>}</div>
    {next && <div className="mdl-next">
      <span className="small"><b>{t('Next')}:</b> {next.title}</span>
      <div className="mdl-bar"><i style={{ width: Math.round(next.progress * 100) + '%' }} /></div>
    </div>}
  </button>
}

/* ------------------------------ the screen ---------------------------- */

export default function MedalsView() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const toast = useUI(s => s.toast)
  // The catalogue of every medal of the app is for administrators; for anybody else the control is not on the screen.
  const admin = user?.admin === true
  const [showAll, setShowAll] = useState(false)
  const catalogue = admin && showAll
  useEffect(() => { if (socialReady(user)) fetchReferral().then(d => rememberSocial({ invited: d?.invited }), () => {}) }, [user?.id])
  const groups = useMemo(() => medalsFor(S, user?.id, { all: catalogue }), [S, user?.id, catalogue])
  const all = allMedals(groups)
  const earned = all.filter(m => m.earned).length
  const pct = all.length ? earned / all.length : 0
  const last = (S.workouts || [])[S.workouts.length - 1]
  const noGoals = !catalogue && !groups.some(g => g.key === 'goals')
  const story = async () => {
    const how = await shareStory(last, { unit: S.unit, mobile: MOBILE })
    if (how === 'shared' || how === 'saved') { bumpMedal('stories'); toast(t('Shared!')) }
    else if (how === 'failed') toast(t('Could not share the image.'))
  }
  return <div className="narrow mdl-view">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div><h1>{t('Medals')}</h1></div>
      {admin
        ? <button className={'iconbtn mdl-admin-b' + (showAll ? ' on' : '')} onClick={() => setShowAll(v => !v)} aria-pressed={showAll}
          aria-label={t('All medals in the app')} title={t('All medals in the app')}><Icon name="crown" /></button>
        : <div style={{ width: 40 }} />}
    </div>
    {catalogue && <p className="mdl-admin small">{t('Administrator view: every medal of the app, whether or not it fits you. Only administrators see this.')}</p>}
    <div className="mdl-hero">
      <div className="mdl-ring" style={{ '--p': pct }}>
        <div><b>{fmtNum(earned)}</b><span>/ {fmtNum(all.length)}</span></div>
      </div>
      <p className="small muted">{t('Your medals start where you are and grow with you: new ones appear as you get closer.')}</p>
    </div>
    {noGoals && <section className="mdl-sec mdl-sec-goals">
      <h3>{t('Your goals')}</h3>
      <div className="mdl-cta">
        <p className="small">{t('Say how you train, your phase or a target with a number, such as a weight or the workouts a week, and medals for it appear here.')}</p>
        <div className="mdl-cta-b"><Button size="sm" variant="primary" icon="target" onClick={coachGoalsSheet}>{t('Set your goals')}</Button></div>
      </div>
    </section>}
    {groups.map(g => g.medals.length > 0 && <section key={g.key} className={'mdl-sec mdl-sec-' + g.key}>
      <h3>{g.title}{catalogue && <span className="mdl-n"> {fmtNum(g.medals.length)}</span>}</h3>
      {g.key === 'goals' && <div className="mdl-cta">
        <p className="small">{t('Medals that follow what you told your coaches: how you train, your phase and your goals.')}</p>
        <div className="mdl-cta-b"><Button size="sm" variant="tinted" icon="target" onClick={coachGoalsSheet}>{t('Edit goals')}</Button></div>
      </div>}
      {g.key === 'social' && <div className="mdl-cta">
        <p className="small">{t('The best medals are won together: invite your friends and share your workouts.')}</p>
        <div className="mdl-cta-b">
          {socialReady(user) && <Button size="sm" variant="primary" icon="person" onClick={inviteSheet}>{t('Invite friends')}</Button>}
          {last && <Button size="sm" variant="tinted" icon="camera" onClick={story}>{t('Share to your story')}</Button>}
        </div>
      </div>}
      <div className="mdl-grid">
        {g.medals.map(m => <button key={m.id} className={'mdl-cell' + (m.earned ? ' on' : '')} onClick={() => medalSheet(m)}>
          <MedalBadge m={m} size={64} />
          <span className="mdl-t">{m.title}</span>
          {!m.earned && <span className="mdl-bar sm"><i style={{ width: Math.round(m.progress * 100) + '%' }} /></span>}
        </button>)}
      </div>
    </section>)}
    <div style={{ height: 30 }} />
  </div>
}

export { TIERS }
