// Olympus notifications (/notifications): follow requests to answer at the top, then likes,
// comments, new followers and accepted requests, newest first. Opening the screen marks them read.
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useSocial } from '../store/useSocial.js'
import { t } from '../lib/i18n.js'
import { fmtAgo } from '../lib/format.js'
import { socialReady, fetchNotifications, fetchRequests, answerRequest, markNotificationsRead, notificationLine, socialErrorText } from '../lib/social.js'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { Avatar, PersonRow } from '../components/Social.jsx'
import '../social.css'

const ICON = { like: 'heart', comment: 'chat', follow: 'person', request: 'lock', accepted: 'checkCircle' }

export default function Notifications() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const ready = socialReady(user)
  const [items, setItems] = useState(null)
  const [requests, setRequests] = useState([])
  const [error, setError] = useState(null)

  const load = async () => {
    setError(null)
    try {
      // What was unread is shown as such once; the server marks everything read in the same visit.
      const before = await fetchNotifications()
      const reqs = await fetchRequests()
      // A request still waiting is listed once, with its buttons, not again among the news.
      const waiting = new Set(reqs.map(u => u.id))
      setItems((before.items || []).filter(n => !(n.kind === 'request' && waiting.has(n.from.id))))
      setRequests(reqs)
      const after = await markNotificationsRead()
      useSocial.getState().set({ unread: after.unread || 0, requests: after.requests || 0 })
    } catch (e) { setError(socialErrorText(e, t)) }
  }
  useEffect(() => { if (ready) load() }, [ready])
  if (!ready) return <Navigate to="/home" replace />

  const answer = async (u, accept) => {
    try {
      const left = await answerRequest(u.id, accept)
      setRequests(left)
      useSocial.getState().set({ requests: left.length })
    } catch (e) { setError(socialErrorText(e, t)) }
  }
  const open = n => {
    if (n.postId && (n.kind === 'like' || n.kind === 'comment')) nav('/post/' + n.postId)
    else nav('/u/' + n.from.id)
  }
  const back = () => (window.history.length > 1 ? nav(-1) : nav('/home'))

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={back} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Notifications')}</h1></div>
    </div>
    {error && <div className="empty">{error}<div style={{ marginTop: 12 }}><Button size="sm" variant="tinted" icon="reset" onClick={load}>{t('Try again')}</Button></div></div>}
    {requests.length > 0 && <>
      <h4 className="sec">{t('Follow requests')}</h4>
      {requests.map(u => <PersonRow key={u.id} user={u} action={<div className="row" style={{ gap: 6 }}>
        <Button size="sm" variant="primary" onClick={e => { e.stopPropagation(); answer(u, true) }}>{t('Accept')}</Button>
        <Button size="sm" onClick={e => { e.stopPropagation(); answer(u, false) }}>{t('Decline')}</Button>
      </div>} />)}
      <div style={{ height: 10 }} />
    </>}
    {!error && (items === null ? <div className="empty">{t('Loading…')}</div>
      : items.length ? <div className="notes">{items.map(n => <button key={n.id} className={'note' + (n.read ? '' : ' unread')} onClick={() => open(n)}>
        <span className="note-av"><Avatar user={n.from} /><span className={'note-k k-' + n.kind}><Icon name={ICON[n.kind] || 'bell'} /></span></span>
        <span className="note-m"><span className="note-t">{notificationLine(n, t)}</span><span className="post-ago">{fmtAgo(n.ts)}</span></span>
      </button>)}</div>
        : !requests.length && <div className="feed-note">
          <div className="ico-big"><Icon name="bell" /></div>
          <h3>{t('Nothing new')}</h3>
          <p>{t('Likes, comments and new followers show up here.')}</p>
        </div>)}
  </div>
}
