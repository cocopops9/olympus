// Profile: who you are on Olympus and everything about your own training in one place.
// Calendar (the month grid and your latest workouts), Stats (the full Stats screen), Body (body
// weight, measurements, progress photos) and, with a server profile, your Posts. The screens
// that used to be tabs (Plan, Exercises) and Settings are reached from the bottom of it.
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, tn } from '../lib/i18n.js'
import { socialReady, fetchProfile, socialErrorText } from '../lib/social.js'
import { streakWeeks } from '../lib/history.js'
import { Button, Segmented, Section, Row } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { Avatar, avatarSheet, PostCard, profileSheet, connectionsSheet, composeSheet, POSTED_EVENT } from '../components/Social.jsx'
import { useSocial } from '../store/useSocial.js'
import { useConnectionTrouble } from '../components/SyncBanner.jsx'
import { Calendar, WorkoutRow, workoutDetailSheet, logPastWorkoutSheet } from '../sheets.jsx'
import Stats from './Stats.jsx'
import Measurements from './Measurements.jsx'
import { BodyWeightCard } from './Home.jsx'
import '../social.css'

const TABS = ['calendar', 'stats', 'body', 'posts']

function CalendarTab({ S }) {
  const nav = useNavigate()
  const recent = S.workouts.slice(-5).reverse()
  return <>
    <div className="prof-month"><Calendar close={() => {}} /></div>
    <div className="row between" style={{ margin: '4px 2px 8px' }}>
      <h3 style={{ margin: 0 }}>{t('Latest workouts')}</h3>
      <span className="small muted">{t('{0} week streak', streakWeeks(S))}</span>
    </div>
    {recent.length ? <div className="list">{recent.map(w => <WorkoutRow key={w.id} w={w} onClick={() => workoutDetailSheet(w)} />)}</div>
      : <div className="empty">{t('No workouts yet. Your first one shows up here.')}</div>}
    <div style={{ height: 12 }} />
    <Button icon="history" onClick={() => nav('/history')}>{t('All workouts')}</Button>
    <div style={{ height: 8 }} />
    <Button icon="plus" onClick={() => logPastWorkoutSheet()}>{t('Log a past workout')}</Button>
  </>
}

function BodyTab({ S }) {
  const nav = useNavigate()
  return <>
    <BodyWeightCard S={S} />
    <Measurements embedded />
    <Section>
      <Row icon="camera" iconTint="var(--pink)" title={t('Progress photos')} accessory="chevron" onClick={() => nav('/progress-photos')} />
    </Section>
  </>
}

function PostsTab({ posts, setPosts, error, onRetry }) {
  if (error) return <div className="empty">{error}<div style={{ marginTop: 12 }}><Button size="sm" variant="tinted" icon="reset" onClick={onRetry}>{t('Try again')}</Button></div></div>
  if (posts === null) return <div className="empty">{t('Loading…')}</div>
  const change = p => setPosts(list => list.map(x => (x.id === p.id ? p : x)))
  const remove = p => setPosts(list => list.filter(x => x.id !== p.id))
  return posts.length ? posts.map(p => <PostCard key={p.id} post={p} onChange={change} onDelete={remove} />)
    : <div className="feed-note">
      <h3>{t('No posts yet')}</h3>
      <p>{t('Share a workout and the people who follow you will see it in their feed.')}</p>
      <Button variant="primary" icon="share" onClick={() => composeSheet()}>{t('Share a workout')}</Button>
    </div>
}

export default function Profile() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const ready = socialReady(user)
  const trouble = useConnectionTrouble()
  const requests = useSocial(s => s.requests)
  const wanted = params.get('tab')
  const tab = TABS.includes(wanted) && (wanted !== 'posts' || ready) ? wanted : 'calendar'
  // In the address, not in state: back from History or a measurement lands on the same tab.
  const setTab = v => setParams(v === 'calendar' ? {} : { tab: v }, { replace: true })

  const [me, setMe] = useState(null)
  const [posts, setPosts] = useState(null)
  const [error, setError] = useState(null)
  const load = () => {
    if (!ready) return
    setError(null)
    fetchProfile('').then(r => { setMe(r.user); setPosts(r.posts || []) }, e => setError(socialErrorText(e, t)))
  }
  useEffect(load, [ready, user?.id])
  useEffect(() => {
    const onPosted = e => {
      const p = e.detail
      if (!p?.id) return
      setPosts(list => (list && !list.some(x => x.id === p.id) ? [p, ...list] : list))
      setMe(m => (m ? { ...m, posts: m.posts + 1 } : m))
    }
    window.addEventListener(POSTED_EVENT, onPosted)
    return () => window.removeEventListener(POSTED_EVENT, onPosted)
  }, [])

  const name = user?.name || t('You')
  const counts = ready && me
    ? [[me.followers, t('Followers'), () => connectionsSheet(me.id, 'followers', true)],
      [me.following, t('Following'), () => connectionsSheet(me.id, 'following', true)],
      [me.posts, t('Posts'), () => setTab('posts')]]
    : [[S.workouts.length, t('Workouts'), () => setTab('calendar')],
      [streakWeeks(S), t('Week streak'), () => setTab('calendar')],
      [S.bodyweight.length, t('Weigh-ins'), () => setTab('body')]]

  const options = [
    { value: 'calendar', label: t('Calendar') },
    { value: 'stats', label: t('Stats') },
    { value: 'body', label: t('Body') },
    ...(ready ? [{ value: 'posts', label: t('Posts') }] : []),
  ]

  return <div className="narrow">
    <div className="hdr">
      <div><h1>{t('Profile')}</h1></div>
      <div className="hdr-actions">
        <ThemeToggle />
        <button className="iconbtn" onClick={() => nav('/settings')} aria-label={trouble ? t('Settings') + ', ' + t('Connection problem') : t('Settings')}>
          <Icon name="gear" />{trouble && <span className="tab-dot" aria-hidden="true" />}
        </button>
      </div>
    </div>

    <div className="prof">
      {ready && me
        ? <button className="prof-av" onClick={() => avatarSheet(me, u => setMe(m => ({ ...m, ...u })))} aria-label={t('Change profile picture')}>
          <Avatar user={{ ...user, avatar: me.avatar }} size="lg" />
          <span className="prof-av-cam" aria-hidden="true"><Icon name="camera" /></span>
        </button>
        : <Avatar user={user || { id: 'local', name }} size="lg" />}
      <div className="prof-n">{name}</div>
      {ready && me?.private && <p className="prof-bio small"><Icon name="lock" className="person-lock" /> {t('Private profile')}</p>}
      {ready && me?.bio && <p className="prof-bio">{me.bio}</p>}
      {ready && requests > 0 && <Button size="sm" variant="tinted" icon="person" style={{ marginTop: 10 }} onClick={() => nav('/notifications')}>
        {tn('{0} follow request', '{0} follow requests', requests)}</Button>}
      {!ready && <p className="prof-bio">{t('Training on this device only.')}</p>}
      <div className="prof-counts">
        {counts.map(([v, l, go]) => <button key={l} onClick={go}><span className="v">{v}</span><span className="l">{l}</span></button>)}
      </div>
      {ready && <div className="prof-actions">
        <Button size="sm" icon="pencil" onClick={() => profileSheet(me, u => setMe(m => ({ ...m, ...u })))}>{t('Edit profile')}</Button>
        <Button size="sm" icon="share" onClick={() => composeSheet()}>{t('New post')}</Button>
      </div>}
    </div>

    <Segmented className="prof-tab" value={tab} onChange={setTab} options={options} />

    {tab === 'calendar' && <CalendarTab S={S} />}
    {tab === 'stats' && <Stats embedded />}
    {tab === 'body' && <BodyTab S={S} />}
    {tab === 'posts' && <PostsTab posts={posts} setPosts={setPosts} error={error} onRetry={load} />}

    <div style={{ height: 18 }} />
    <Section title={t('Training')}>
      <Row icon="sun" iconTint="var(--orange)" title={t('Today’s training')} subtitle={t('This week, today’s session, check-in')} accessory="chevron" onClick={() => nav('/today')} />
      <Row icon="calendar" iconTint="var(--acc)" title={t('Plan')} subtitle={t('Your routines and weekly schedule')} accessory="chevron" onClick={() => nav('/plan')} />
      <Row icon="dumbbell" iconTint="var(--blue)" title={t('Exercises')} subtitle={t('The library, by muscle and equipment')} accessory="chevron" onClick={() => nav('/library')} />
      <Row icon="gear" iconTint="var(--grey)" title={t('Settings')} accessory="chevron" onClick={() => nav('/settings')} />
    </Section>
  </div>
}
