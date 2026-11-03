// Olympus: medals (lib/medals.js). The medal itself, the screen with all of them (/medals), the
// card on the Profile, and the celebration: when a medal is earned it bursts onto the screen with
// the fanfare, once, whatever earned it (a workout finished, a friend who joined, a story shared).
//
// The counters behind the social medals live in S.medals: { got: { id: time celebrated },
// invites, stories, invited, posts, followers }; the last three are the server's numbers, kept so
// the medals read the same offline.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { fmtDate, fmtNum } from '../lib/format.js'
import { medalsOf, allMedals, newlyEarned, nextMedal, TIERS } from '../lib/medals.js'
import { socialReady } from '../lib/social.js'
import { fetchReferral } from '../lib/referral.js'
import { shareStory } from '../lib/story-card.js'
import { triumph } from '../lib/sound.js'
import { MOBILE } from '../lib/mobile.js'
import { inviteSheet } from './Community.jsx'
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
    <div style={{ height: 8 }} />
    <Button onClick={close}>{t('Close')}</Button>
  </div>
}
export const medalSheet = m => useUI.getState().openSheet(close => <MedalDetail m={m} close={close} />, { kind: 'center' })

/* ---------------------------- celebration ---------------------------- */

let showCelebration = null

/** The burst: the medal spins in, light sweeps it, confetti falls, and what it means is said. */
export function MedalCelebration() {
  const nav = useNavigate()
  const [queue, setQueue] = useState([])
  const sound = useStore(s => s.S.sound)
  useEffect(() => {
    showCelebration = list => setQueue(q => [...q, ...list])
    // The browser demo shows the celebration on demand (for screenshots and tests).
    if (import.meta.env.VITE_DEMO === '1') window.__medalBurst = () => setQueue(allMedals(medalsOf(useStore.getState().S, {})).filter(x => x.earned && x.fun).slice(-2))
    return () => { showCelebration = null }
  }, [])
  const m = queue[0]
  useEffect(() => { if (m) triumph(sound) }, [m?.id])
  const confetti = useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.6, dur: 1.8 + Math.random() * 1.6, rot: Math.random() * 360,
    color: ['#f2b51c', '#ffe08a', '#ffffff', '#ff9f0a', '#c98c0a'][i % 5],
  })), [m?.id])
  if (!m) return null
  const more = queue.length - 1
  const next = () => setQueue(q => q.slice(1))
  return <div className="mdl-burst" role="dialog" aria-modal="true" aria-label={t('New medal!')} onClick={next}>
    <div className="mdl-confetti" aria-hidden="true">{confetti.map((c, i) => <i key={i} style={{ left: c.left + '%', animationDelay: c.delay + 's', animationDuration: c.dur + 's', background: c.color, transform: `rotate(${c.rot}deg)` }} />)}</div>
    <div className="mdl-burst-card" onClick={e => e.stopPropagation()}>
      <div className="mdl-burst-k">{t('New medal!')}</div>
      <div className="mdl-burst-medal"><MedalBadge m={m} size={150} glow /></div>
      <div className="mdl-tier">{tierName(m.tier)}</div>
      <h2>{m.title}</h2>
      {m.fun ? <p className="mdl-fun big">{m.fun}</p> : <p className="muted">{m.desc}</p>}
      <Button variant="primary" onClick={next}>{more > 0 ? t('Next medal ({0} more)', more) : t('Keep going')}</Button>
      <button className="plan-textbtn" style={{ marginTop: 10 }} onClick={() => { setQueue([]); nav('/medals') }}>{t('See all my medals')}</button>
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
      const groups = medalsOf(S, social(S))
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
  }, [ready, S.workouts, S.medals, S.active, S.bodyweight, S.birth, S.body])
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
  const groups = useMemo(() => medalsOf(S, social(S)), [S])
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
  useEffect(() => { if (socialReady(user)) fetchReferral().then(d => rememberSocial({ invited: d?.invited }), () => {}) }, [user?.id])
  const groups = useMemo(() => medalsOf(S, social(S)), [S])
  const all = allMedals(groups)
  const earned = all.filter(m => m.earned).length
  const pct = all.length ? earned / all.length : 0
  const last = (S.workouts || [])[S.workouts.length - 1]
  const story = async () => {
    const how = await shareStory(last, { unit: S.unit, mobile: MOBILE })
    if (how === 'shared' || how === 'saved') { bumpMedal('stories'); toast(t('Shared!')) }
    else if (how === 'failed') toast(t('Could not share the image.'))
  }
  return <div className="narrow mdl-view">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div><h1>{t('Medals')}</h1></div>
      <div style={{ width: 40 }} />
    </div>
    <div className="mdl-hero">
      <div className="mdl-ring" style={{ '--p': pct }}>
        <div><b>{fmtNum(earned)}</b><span>/ {fmtNum(all.length)}</span></div>
      </div>
      <p className="small muted">{t('Your medals start where you are and grow with you: new ones appear as you get closer.')}</p>
    </div>
    {groups.map(g => g.medals.length > 0 && <section key={g.key} className={'mdl-sec mdl-sec-' + g.key}>
      <h3>{g.title}</h3>
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
