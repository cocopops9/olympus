// One post on its own (/post/:id), with its comments open: where a notification about a like or
// a comment leads.
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { socialReady, fetchPost, socialErrorText } from '../lib/social.js'
import Icon from '../components/Icon.jsx'
import { PostCard } from '../components/Social.jsx'
import '../social.css'

export default function PostView() {
  const nav = useNavigate()
  const { id } = useParams()
  const user = useStore(s => s.user)
  const ready = socialReady(user)
  const [post, setPost] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    if (!ready) return
    let live = true
    setPost(null); setError(null)
    fetchPost(id).then(p => { if (live) setPost(p) }, e => { if (live) setError(socialErrorText(e, t)) })
    return () => { live = false }
  }, [ready, id])
  if (!ready) return <Navigate to="/home" replace />
  const back = () => (window.history.length > 1 ? nav(-1) : nav('/home'))
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={back} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1 style={{ fontSize: 22 }}>{t('Post')}</h1></div>
    </div>
    {error ? <div className="empty">{error}</div>
      : !post ? <div className="empty">{t('Loading…')}</div>
        : <PostCard post={post} onChange={setPost} onDelete={() => nav('/home', { replace: true })} commentsOpen />}
  </div>
}
