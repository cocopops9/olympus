// Another person's profile (/u/:id): their name, bio, followers and posts, and a follow button.
// Your own id here is sent to Profile, which is where your own page lives.
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { socialReady, fetchProfile, socialErrorText } from '../lib/social.js'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { Avatar, PostCard, FollowButton, connectionsSheet } from '../components/Social.jsx'
import '../social.css'

export default function UserProfile() {
  const nav = useNavigate()
  const { id } = useParams()
  const me = useStore(s => s.user)
  const ready = socialReady(me)
  const [user, setUser] = useState(null)
  const [posts, setPosts] = useState(null)
  const [next, setNext] = useState(null)
  const [error, setError] = useState(null)
  const [more, setMore] = useState(false)

  useEffect(() => {
    if (!ready || !id || id === me?.id) return
    let live = true
    setUser(null); setPosts(null); setError(null)
    fetchProfile(id).then(r => { if (live) { setUser(r.user); setPosts(r.posts || []); setNext(r.next || null) } },
      e => { if (live) setError(socialErrorText(e, t)) })
    return () => { live = false }
  }, [ready, id, me?.id])

  if (!ready) return <Navigate to="/home" replace />
  if (id === me?.id) return <Navigate to="/profile" replace />

  const loadMore = async () => {
    if (!next || more) return
    setMore(true)
    try { const r = await fetchProfile(id, next); setPosts(list => [...list, ...(r.posts || [])]); setNext(r.next || null) }
    catch (e) { setError(socialErrorText(e, t)) } finally { setMore(false) }
  }
  const change = p => setPosts(list => list.map(x => (x.id === p.id ? p : x)))
  const remove = p => setPosts(list => list.filter(x => x.id !== p.id))
  const back = () => (window.history.length > 1 ? nav(-1) : nav('/home'))

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={back} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1 style={{ fontSize: 22 }}>{user?.name || ''}</h1></div>
    </div>
    {error ? <div className="empty">{error}</div> : !user ? <div className="empty">{t('Loading…')}</div> : <>
      <div className="prof">
        <Avatar user={user} size="lg" />
        <div className="prof-n">{user.name}</div>
        {user.bio && <p className="prof-bio">{user.bio}</p>}
        <div className="prof-counts">
          <button onClick={() => connectionsSheet(user.id, 'followers')}><span className="v">{user.followers}</span><span className="l">{t('Followers')}</span></button>
          <button onClick={() => connectionsSheet(user.id, 'following')}><span className="v">{user.following}</span><span className="l">{t('Following')}</span></button>
          <button disabled><span className="v">{user.posts}</span><span className="l">{t('Posts')}</span></button>
        </div>
        <div className="prof-actions"><FollowButton user={user} size={undefined} onChange={setUser} /></div>
      </div>
      {posts.length ? <>
        {posts.map(p => <PostCard key={p.id} post={p} onChange={change} onDelete={remove} />)}
        {next && <div className="feed-loadmore"><Button size="sm" variant="tinted" disabled={more} onClick={loadMore}>{more ? t('Loading…') : t('Load more')}</Button></div>}
      </> : <div className="empty">{t('{0} has not posted yet.', user.name)}</div>}
    </>}
  </div>
}
