// Another person's profile (/u/:id): their name, bio, followers and posts, a follow button
// (Requested while a private profile has not answered), and Block / Unblock behind the ⋯ menu.
// Your own id here is sent to Profile, which is where your own page lives.
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { useWhenVisible } from '../store/useSocial.js'
import { t } from '../lib/i18n.js'
import { socialReady, fetchProfile, socialErrorText } from '../lib/social.js'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { Avatar, PostCard, FollowButton, connectionsSheet, toggleBlock } from '../components/Social.jsx'
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

  const load = () => {
    let live = true
    setError(null)
    fetchProfile(id).then(r => { if (live) { setUser(r.user); setPosts(r.posts || []); setNext(r.next || null) } },
      e => { if (live) setError(socialErrorText(e, t)) })
    return () => { live = false }
  }
  useEffect(() => {
    if (!ready || !id || id === me?.id) return
    setUser(null); setPosts(null)
    return load()
  }, [ready, id, me?.id])

  // An answer to a follow request, a new post: seen as soon as the app is in front again.
  useWhenVisible(() => { if (ready && id && id !== me?.id) load() })

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
  // A follow that was accepted at once, or an unblock, can open the posts: read them again.
  const followed = u => { const opens = u.canSeePosts && !user.canSeePosts; setUser(u); if (opens) load() }
  const menu = () => useUI.getState().openSheet(close => <>
    <h3>{user.name}</h3>
    <Button variant={user.blockedByMe ? 'plain' : 'danger'} icon={user.blockedByMe ? 'checkCircle' : 'xmark'}
      onClick={() => { close(); toggleBlock(user, u => { setUser(u); if (!u.blockedByMe) load(); else setPosts([]) }) }}>
      {user.blockedByMe ? t('Unblock') : t('Block')}
    </Button>
  </>)

  const locked = user && !user.canSeePosts
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={back} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1 style={{ fontSize: 22 }}>{user?.name || ''}</h1></div>
      {user && <button className="iconbtn" onClick={menu} aria-label={t('More')}><Icon name="more" /></button>}
    </div>
    {error ? <div className="empty">{error}</div> : !user ? <div className="empty">{t('Loading…')}</div> : <>
      <div className="prof">
        <Avatar user={user} size="lg" />
        <div className="prof-n">{user.name}{user.private && <Icon name="lock" className="person-lock" aria-label={t('Private profile')} />}</div>
        {user.bio && <p className="prof-bio">{user.bio}</p>}
        {user.followsMe && !user.blockedByMe && <p className="prof-bio small">{t('Follows you')}</p>}
        <div className="prof-counts">
          <button disabled={locked} onClick={() => connectionsSheet(user.id, 'followers')}><span className="v">{user.followers}</span><span className="l">{t('Followers')}</span></button>
          <button disabled={locked} onClick={() => connectionsSheet(user.id, 'following')}><span className="v">{user.following}</span><span className="l">{t('Following')}</span></button>
          <button disabled><span className="v">{user.posts}</span><span className="l">{t('Posts')}</span></button>
        </div>
        <div className="prof-actions">
          {user.blockedByMe
            ? <Button size="sm" onClick={() => toggleBlock(user, u => { setUser(u); load() })}>{t('Unblock')}</Button>
            : <FollowButton user={user} size={undefined} onChange={followed} />}
        </div>
      </div>
      {user.blockedByMe ? <div className="feed-note">
        <div className="ico-big"><Icon name="xmark" /></div>
        <h3>{t('You blocked {0}', user.name)}</h3>
        <p>{t('You do not see each other’s posts. Unblock to follow each other again.')}</p>
      </div>
        : locked ? <div className="feed-note">
          <div className="ico-big"><Icon name="lock" /></div>
          <h3>{t('This profile is private.')}</h3>
          <p>{user.requested ? t('Your request is waiting for {0} to answer.', user.name) : t('Follow {0} to ask to see their posts.', user.name)}</p>
        </div>
          : posts.length ? <>
            {posts.map(p => <PostCard key={p.id} post={p} onChange={change} onDelete={remove} />)}
            {next && <div className="feed-loadmore"><Button size="sm" variant="tinted" disabled={more} onClick={loadMore}>{more ? t('Loading…') : t('Load more')}</Button></div>}
          </> : <div className="empty">{t('{0} has not posted yet.', user.name)}</div>}
    </>}
  </div>
}
