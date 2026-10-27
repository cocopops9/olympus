// Home: the Olympus feed. Posts from the people you follow (Following) or from everyone on the
// server (Discover), a search for people, and a button to share a workout. The training
// dashboard that used to be Home now lives at /today, one tap away from here and from Profile.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useSocial, useWhenVisible } from '../store/useSocial.js'
import { t } from '../lib/i18n.js'
import { socialReady, fetchFeed, fetchDiscover, searchUsers, socialErrorText } from '../lib/social.js'
import { Button, Segmented, SearchField } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { PostCard, PersonRow, composeSheet, POSTED_EVENT } from '../components/Social.jsx'
import { MOBILE } from '../lib/mobile.js'
import { DEFAULT_SERVER } from '../lib/app-info.js'
import { openAccountSheet } from './MobileOnboarding.jsx'
import '../social.css'

function NoServer() {
  const nav = useNavigate()
  return <div className="feed-note">
    <div className="ico-big"><Icon name="globe" /></div>
    <h3>{t('Train together')}</h3>
    {MOBILE && DEFAULT_SERVER ? <>
      {/* The app's own server: an account, nothing to set up. */}
      <p>{t('Create a profile to follow friends and share your workouts. Your training is then kept on this phone and on the Olympus server.')}</p>
      <Button variant="primary" icon="person" onClick={() => openAccountSheet('signup')}>{t('Create account')}</Button>
      <div style={{ height: 8 }} />
      <Button icon="key" onClick={() => openAccountSheet('login')}>{t('Sign in')}</Button>
    </> : <>
      <p>{t('The feed, people search and posts live on an Olympus server. Sign in to your server, or connect this phone to one, to follow friends and share your workouts.')}</p>
      <Button variant="primary" icon="cloud" onClick={() => nav('/settings')}>{t('Connect to a server')}</Button>
    </>}
    <div style={{ height: 8 }} />
    <Button icon="calendar" onClick={() => nav('/today')}>{t('Today’s training')}</Button>
  </div>
}

function People({ onClose }) {
  const [q, setQ] = useState('')
  const [users, setUsers] = useState(null)
  const [error, setError] = useState(null)
  const input = useRef(null)
  useEffect(() => { input.current?.focus() }, [])
  // A short pause after typing before asking, so a name is one request rather than one per key.
  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      searchUsers(q.trim()).then(u => { if (live) { setUsers(u); setError(null) } }, e => { if (live) setError(socialErrorText(e, t)) })
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [q])
  const update = u => setUsers(list => list.map(x => (x.id === u.id ? u : x)))
  return <div>
    <div className="row" style={{ gap: 8, marginBottom: 12 }}>
      <div style={{ flex: 1 }}>
        <SearchField ref={input} value={q} placeholder={t('Search people')} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} />
      </div>
      <Button size="sm" variant="ghost" onClick={onClose}>{t('Done')}</Button>
    </div>
    {error ? <div className="empty">{error}</div>
      : users === null ? <div className="empty">{t('Loading…')}</div>
        : users.length ? <>
          {!q.trim() && <h4 className="sec">{t('People on this server')}</h4>}
          {users.map(u => <PersonRow key={u.id} user={u} onChange={update} />)}
        </> : <div className="empty">{q.trim() ? t('Nobody by that name.') : t('You are the first one here. Invite a friend to join your server.')}</div>}
  </div>
}

export default function Feed() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const ready = socialReady(user)
  const news = useSocial(s => s.unread + s.requests)
  const [tab, setTab] = useState('following')
  const [searching, setSearching] = useState(false)
  const [posts, setPosts] = useState(null)
  const [next, setNext] = useState(null)
  const [error, setError] = useState(null)
  const [more, setMore] = useState(false)

  const load = useCallback(async (which, before) => {
    const fetcher = which === 'discover' ? fetchDiscover : fetchFeed
    const page = await fetcher(before)
    return { posts: page.posts || [], next: page.next || null }
  }, [])

  useEffect(() => {
    if (!ready) return
    let live = true
    setPosts(null); setError(null); setNext(null)
    load(tab).then(p => { if (live) { setPosts(p.posts); setNext(p.next) } }, e => { if (live) setError(socialErrorText(e, t)) })
    return () => { live = false }
  }, [ready, tab, load])

  const loadMore = async () => {
    if (!next || more) return
    setMore(true)
    try { const p = await load(tab, next); setPosts(list => [...list, ...p.posts]); setNext(p.next) }
    catch (e) { setError(socialErrorText(e, t)) }
    finally { setMore(false) }
  }
  const refresh = () => {
    setPosts(null); setError(null)
    load(tab).then(p => { setPosts(p.posts); setNext(p.next) }, e => setError(socialErrorText(e, t)))
  }
  // Back in front: the newest page again, quietly, keeping what is on screen until it arrives.
  useWhenVisible(() => {
    if (!ready || searching) return
    load(tab).then(p => { setPosts(p.posts); setNext(p.next) }, () => {})
  })
  const change = p => setPosts(list => list.map(x => (x.id === p.id ? p : x)))
  const remove = p => setPosts(list => list.filter(x => x.id !== p.id))
  // New posts arrive through POSTED_EVENT, whether written here or from a workout sheet.
  useEffect(() => {
    const onPosted = e => {
      const p = e.detail
      // A post changed after the fact (a title or photos added after the workout) replaces its old copy.
      if (p && p.id) setPosts(list => (!list ? list : list.some(x => x.id === p.id) ? list.map(x => (x.id === p.id ? { ...x, ...p } : x)) : [p, ...list]))
    }
    window.addEventListener(POSTED_EVENT, onPosted)
    return () => window.removeEventListener(POSTED_EVENT, onPosted)
  }, [])
  const posted = () => {}

  return <div className="narrow">
    <div className="hdr">
      <div><h1>Olympus</h1><div className="sub">{ready ? t('Your feed') : t('Train, share, follow')}</div></div>
      <div className="hdr-actions">
        {ready && <button className="iconbtn" onClick={() => nav('/notifications')} aria-label={news ? t('Notifications') + ', ' + t('New notifications') : t('Notifications')}>
          <Icon name="bell" />{news > 0 && <span className="icon-badge" aria-hidden="true">{news > 9 ? '9+' : news}</span>}</button>}
        {ready && <button className="iconbtn" onClick={() => setSearching(v => !v)} aria-label={t('Search people')}><Icon name="magnifier" /></button>}
        {ready && <button className="iconbtn" onClick={() => composeSheet({ onPosted: posted })} aria-label={t('New post')}><Icon name="plus" /></button>}
      </div>
    </div>

    {!ready ? <NoServer /> : searching ? <People onClose={() => setSearching(false)} /> : <>
      <Segmented className="feed-tabs" value={tab} onChange={setTab}
        options={[{ value: 'following', label: t('Following') }, { value: 'discover', label: t('Discover') }]} />
      {error ? <div className="empty">{error}<div style={{ marginTop: 12 }}><Button size="sm" variant="tinted" icon="reset" onClick={refresh}>{t('Try again')}</Button></div></div>
        : posts === null ? <div className="empty">{t('Loading…')}</div>
          : posts.length ? <>
            {posts.map(p => <PostCard key={p.id} post={p} onChange={change} onDelete={remove} />)}
            {next && <div className="feed-loadmore"><Button size="sm" variant="tinted" disabled={more} onClick={loadMore}>{more ? t('Loading…') : t('Load more')}</Button></div>}
          </> : <div className="feed-note">
            <div className="ico-big"><Icon name="person" /></div>
            <h3>{tab === 'following' ? t('Your feed is empty') : t('No posts yet')}</h3>
            <p>{tab === 'following' ? t('Follow people to see their workouts here, or share your own.') : t('Be the first: share a workout with everyone on this server.')}</p>
            {tab === 'following' && <><Button variant="primary" icon="magnifier" onClick={() => setSearching(true)}>{t('Find people')}</Button><div style={{ height: 8 }} /></>}
            <Button icon="share" onClick={() => composeSheet({ onPosted: posted })}>{t('Share a workout')}</Button>
          </div>}
      <div style={{ height: 6 }} />
      <Button variant="ghost" icon="calendar" onClick={() => nav('/today')}>{t('Today’s training')}</Button>
    </>}
  </div>
}
