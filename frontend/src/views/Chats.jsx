// Olympus messages: the list of your conversations (/chats) and one conversation (/chats/:id).
// Messages go between two profiles and are private to them (api/chat.js). There is no live
// connection to the server: the open conversation asks again every few seconds, the list every
// minute with the other counts (store/useSocial.js).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useSocial } from '../store/useSocial.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtAgo } from '../lib/format.js'
import { socialReady, fetchChats, fetchThread, sendMessage, markChatRead, deleteMessage, chatErrorText } from '../lib/social.js'
import Icon from '../components/Icon.jsx'
import { Avatar, Name, confirmAction } from '../components/Social.jsx'
import '../social.css'
import '../chats.css'

const THREAD_EVERY_MS = 4000

/** The conversations, the latest first. */
export default function Chats() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const ready = socialReady(user)
  const [chats, setChats] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    if (!ready) return
    let gone = false
    const load = () => fetchChats().then(r => { if (!gone) { setChats(r?.chats || []); setError(null) } }, e => { if (!gone) setError(chatErrorText(e, t)) })
    load()
    const tm = setInterval(load, 20000)
    return () => { gone = true; clearInterval(tm) }
  }, [ready])
  if (!ready) return <Navigate to="/home" replace />
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1 style={{ fontSize: 22 }}>{t('Messages')}</h1></div>
    </div>
    {error ? <div className="empty">{error}</div>
      : chats === null ? <div className="empty">{t('Loading…')}</div>
        : !chats.length ? <div className="feed-note">
          <div className="ico-big"><Icon name="chat" /></div>
          <h3>{t('No messages yet')}</h3>
          <p>{t('Open someone’s profile and tap Message to write to them.')}</p>
        </div>
          : <div className="chats">
            {chats.map(c => <button key={c.id} className={'chat-row' + (c.unread ? ' unread' : '')} onClick={() => nav('/chats/' + c.id)}>
              <Avatar user={c.user} />
              <span className="chat-row-m">
                <span className="chat-row-n"><Name user={c.user} /><small>{fmtAgo(c.at)}</small></span>
                <span className="chat-row-t">{c.mine ? t('You: {0}', c.text) : c.text}</span>
              </span>
              {c.unread > 0 && <span className="chat-row-u" aria-label={t('{0} unread', c.unread)}>{c.unread > 9 ? '9+' : c.unread}</span>}
            </button>)}
          </div>}
  </div>
}

/** One conversation: the messages, and the line to write the next one. */
export function ChatThread() {
  const nav = useNavigate()
  const { id } = useParams()
  const me = useStore(s => s.user)
  const ready = socialReady(me)
  const [peer, setPeer] = useState(null)
  const [messages, setMessages] = useState(null)
  const [more, setMore] = useState(false)
  const [seen, setSeen] = useState(0)
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const end = useRef(null)
  const lastId = useRef(0)

  // The latest page, merged over what is shown: older messages loaded before stay.
  const load = useCallback(async () => {
    const r = await fetchThread(id)
    setPeer(r.user); setSeen(r.seen | 0)
    setMessages(old => {
      if (!old) { setMore(!!r.more); return r.messages }
      const first = r.messages[0]?.id ?? Infinity
      return [...old.filter(m => m.id < first), ...r.messages]
    })
    const newest = r.messages.at(-1)
    if (newest && newest.id !== lastId.current) {
      if (!newest.mine) markChatRead(id).then(() => useSocial.getState().refresh(), () => {})
      lastId.current = newest.id
      setTimeout(() => end.current?.scrollIntoView?.({ block: 'end' }), 0)
    }
  }, [id])

  useEffect(() => {
    if (!ready) return
    let gone = false
    setMessages(null); setPeer(null); setError(null); lastId.current = 0
    const tick = () => { if (document.visibilityState !== 'hidden') load().catch(e => { if (!gone) setError(old => old || (lastId.current ? null : chatErrorText(e, t))) }) }
    tick()
    const tm = setInterval(tick, THREAD_EVERY_MS)
    return () => { gone = true; clearInterval(tm) }
  }, [ready, load])

  const older = async () => {
    const first = messages?.[0]
    if (!first) return
    try {
      const r = await fetchThread(id, first.id)
      setMessages(old => [...r.messages, ...(old || [])]); setMore(!!r.more)
    } catch (e) { useUI.getState().toast(chatErrorText(e, t)) }
  }
  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const r = await sendMessage(id, text)
      setDraft('')
      setMessages(old => [...(old || []), r.message])
      lastId.current = r.message.id
      setTimeout(() => end.current?.scrollIntoView?.({ block: 'end' }), 0)
    } catch (e) { useUI.getState().toast(chatErrorText(e, t)) } finally { setSending(false) }
  }
  const takeBack = m => confirmAction({
    title: t('Delete this message?'), message: t('It disappears for both of you.'), confirmText: t('Delete'),
    onConfirm: async () => {
      try { await deleteMessage(id, m.id); setMessages(old => (old || []).filter(x => x.id !== m.id)) }
      catch (e) { useUI.getState().toast(chatErrorText(e, t)) }
    },
  })

  if (!ready) return <Navigate to="/home" replace />
  // The day above the first message of each day.
  const dayOf = at => new Date(at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return <div className="narrow chat">
    <div className="hdr chat-hdr">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      {peer && <button className="chat-peer" onClick={() => nav('/u/' + peer.id)}>
        <Avatar user={peer} size="sm" /><Name user={peer} />
      </button>}
    </div>
    <div className="chat-log">
      {error ? <div className="empty">{error}</div>
        : messages === null ? <div className="empty">{t('Loading…')}</div>
          : <>
            {more && <button className="plan-textbtn chat-older" onClick={older}>{t('Earlier messages')}</button>}
            {!messages.length && <div className="empty small">{t('Say hi to {0}.', peer?.name || '')}</div>}
            {messages.map((m, i) => {
              const day = dayOf(m.at)
              const first = i === 0 || dayOf(messages[i - 1].at) !== day
              return <div key={m.id} className="chat-item">
                {first && <div className="chat-day">{day}</div>}
                <div className={'chat-m ' + (m.mine ? 'me' : 'them')} onContextMenu={m.mine ? e => { e.preventDefault(); takeBack(m) } : undefined}>
                  <span className="chat-m-t">{m.text}</span>
                  <span className="chat-m-s">{new Date(m.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    {m.mine && m.id <= seen && <Icon name="check" className="chat-seen" aria-label={t('Seen')} />}
                    {m.mine && <button className="chat-m-x" onClick={() => takeBack(m)} aria-label={t('Delete')}><Icon name="trash" /></button>}
                  </span>
                </div>
              </div>
            })}
            <div ref={end} />
          </>}
    </div>
    {!error && <form className="chat-in" onSubmit={e => { e.preventDefault(); send() }}>
      <textarea rows={1} value={draft} maxLength={2000} placeholder={t('Write a message…')} aria-label={t('Write a message…')}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
      <button type="submit" className="chat-send" disabled={sending || !draft.trim()} aria-label={t('Send')}><Icon name="arrowUp" /></button>
    </form>}
  </div>
}
