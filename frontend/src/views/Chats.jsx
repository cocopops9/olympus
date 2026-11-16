// Olympus messages: the list of your conversations (/chats) and one conversation (/chats/:id).
// Messages go between two profiles and are private to them (api/chat.js): words, and a photo, a
// voice message or a file (components/ChatAttachment.jsx). There is no live
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
import { preparePhoto } from '../lib/social-photo.js'
import { canRecordNote, startVoiceNote, blobToDataUrl, fmtSecs } from '../lib/voice-note.js'
import { ChatAttachment, attachmentLabel, rememberMedia } from '../components/ChatAttachment.jsx'
import Icon from '../components/Icon.jsx'
import { Avatar, Name, confirmAction } from '../components/Social.jsx'
import '../social.css'
import '../chats.css'

const THREAD_EVERY_MS = 4000
const FILE_MAX = 3.5 * 1024 * 1024

// The phone's own copy of what it is sending, shown while it uploads.
const localUrls = new WeakMap()
const localUrl = m => {
  if (m.attachment?.kind === 'file') return m.blob
  if (!localUrls.has(m.blob)) localUrls.set(m.blob, URL.createObjectURL(m.blob))
  return localUrls.get(m.blob)
}

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
                <span className="chat-row-t">{(() => {
                  const what = c.kind ? (c.text ? attachmentLabel(c.kind) + ': ' + c.text : attachmentLabel(c.kind)) : c.text
                  return <>{c.kind && <Icon name={c.kind === 'image' ? 'image' : c.kind === 'audio' ? 'mic' : 'doc'} className="chat-row-k" />}{c.mine ? t('You: {0}', what) : what}</>
                })()}</span>
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
  const scrollDown = () => setTimeout(() => end.current?.scrollIntoView?.({ block: 'end' }), 0)
  // A message on screen at once, marked as on its way, replaced by the server's when it arrives.
  const deliver = async ({ text = '', attachment = null, blob = null }) => {
    const temp = { id: 'tmp' + Math.random().toString(36).slice(2), mine: true, text, at: Date.now(), pending: true,
      ...(attachment ? { attachment: { kind: attachment.kind, size: blob?.size || 0, ...(attachment.name ? { name: attachment.name } : {}), ...(attachment.secs ? { secs: attachment.secs } : {}) } } : {}),
      ...(blob ? { blob } : {}) }
    setMessages(old => [...(old || []), temp]); scrollDown()
    try {
      const r = await sendMessage(id, text, attachment)
      if (blob) rememberMedia(id, r.message.id, blob)
      setMessages(old => (old || []).map(m => (m.id === temp.id ? r.message : m)))
      lastId.current = r.message.id
      return true
    } catch (e) {
      setMessages(old => (old || []).filter(m => m.id !== temp.id))
      useUI.getState().toast(chatErrorText(e, t))
      return false
    }
  }
  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setDraft('')
    const ok = await deliver({ text })
    if (!ok) setDraft(text)
    setSending(false)
  }
  const sendPhoto = async file => {
    let data
    try { data = await preparePhoto(file) } catch { useUI.getState().toast(t('That photo could not be read.')); return }
    const blob = await (await fetch(data)).blob()
    deliver({ attachment: { kind: 'image', data }, blob })
  }
  const sendFile = async file => {
    if (file.size > FILE_MAX) { useUI.getState().toast(t('That file is too large to send.')); return }
    if (/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) return sendPhoto(file)
    deliver({ attachment: { kind: 'file', data: await blobToDataUrl(file), name: file.name }, blob: file })
  }
  const sendVoice = async ({ blob, secs }) => {
    deliver({ attachment: { kind: 'audio', data: await blobToDataUrl(blob), secs }, blob })
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
                <div className={'chat-m ' + (m.mine ? 'me' : 'them') + (m.attachment ? ' has-a a-' + m.attachment.kind : '') + (m.pending ? ' pending' : '')} onContextMenu={m.mine && !m.pending ? e => { e.preventDefault(); takeBack(m) } : undefined}>
                  {m.attachment && <ChatAttachment peer={id} message={m} local={m.blob ? localUrl(m) : null} />}
                  {m.text && <span className="chat-m-t">{m.text}</span>}
                  <span className="chat-m-s">{m.pending ? <><i className="spin sm" /> {t('Sending…')}</> : new Date(m.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    {m.mine && !m.pending && m.id <= seen && <Icon name="check" className="chat-seen" aria-label={t('Seen')} />}
                    {m.mine && !m.pending && <button className="chat-m-x" onClick={() => takeBack(m)} aria-label={t('Delete')}><Icon name="trash" /></button>}
                  </span>
                </div>
              </div>
            })}
            <div ref={end} />
          </>}
    </div>
    {!error && <Composer draft={draft} setDraft={setDraft} sending={sending} onSend={send} onPhoto={sendPhoto} onFile={sendFile} onVoice={sendVoice} />}
  </div>
}

/**
 * The writing line: a paperclip for a photo or a file, the words, and on the right the paper
 * plane to send them or, while nothing is written, the microphone for a voice message. Recording
 * shows how long and how loud, with a bin to throw it away and the plane to send it.
 */
function Composer({ draft, setDraft, sending, onSend, onPhoto, onFile, onVoice }) {
  const [rec, setRec] = useState(null)   // { note, ms, level }
  const photoIn = useRef(null), camIn = useRef(null), fileIn = useRef(null)
  const note = useRef(null)
  const canVoice = canRecordNote()
  useEffect(() => () => note.current?.cancel(), [])
  useEffect(() => {
    if (!rec) return
    const tm = setInterval(() => { const n = note.current; if (n) setRec(r => r && { ...r, ms: n.elapsed(), level: n.level() }) }, 100)
    return () => clearInterval(tm)
  }, [!!rec])
  const record = async () => {
    try {
      note.current = await startVoiceNote({ onLimit: () => finish() })
      setRec({ ms: 0, level: 0 })
    } catch (e) {
      useUI.getState().toast(e?.code === 'permission' ? t('Allow the microphone to record a voice message.') : t('Voice messages cannot be recorded on this device.'))
    }
  }
  const finish = async () => {
    const n = note.current
    note.current = null
    setRec(null)
    const out = await n?.stop()
    if (out) onVoice(out)
    else if (n) useUI.getState().toast(t('That was too short to send.'))
  }
  const discard = () => { note.current?.cancel(); note.current = null; setRec(null) }
  const attach = () => useUI.getState().openSheet(close => <div className="chat-attach">
    <button onClick={() => { close(); photoIn.current?.click() }}><span className="t-green"><Icon name="image" /></span>{t('Photo')}</button>
    <button onClick={() => { close(); camIn.current?.click() }}><span className="t-blue"><Icon name="camera" /></span>{t('Camera')}</button>
    <button onClick={() => { close(); fileIn.current?.click() }}><span className="t-orange"><Icon name="doc" /></span>{t('File')}</button>
  </div>)
  const picked = (fn, e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) fn(f) }
  const bars = Array.from({ length: 24 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7 + (rec?.ms || 0) / 160)) * (rec?.level || 0.05))
  return <form className="chat-in" onSubmit={e => { e.preventDefault(); onSend() }}>
    <input ref={photoIn} type="file" accept="image/*" hidden onChange={e => picked(onPhoto, e)} data-testid="chat-photo" />
    <input ref={camIn} type="file" accept="image/*" capture="environment" hidden onChange={e => picked(onPhoto, e)} />
    <input ref={fileIn} type="file" hidden onChange={e => picked(onFile, e)} data-testid="chat-file" />
    {rec ? <>
      <button type="button" className="chat-tool danger" onClick={discard} aria-label={t('Delete recording')}><Icon name="trash" /></button>
      <div className="chat-rec" role="status" aria-label={t('Recording a voice message')}>
        <i className="chat-rec-dot" />
        <span className="chat-rec-t">{fmtSecs(rec.ms / 1000)}</span>
        <span className="chat-rec-bars" aria-hidden="true">{bars.map((h, i) => <i key={i} style={{ transform: `scaleY(${h})` }} />)}</span>
      </div>
      <button type="button" className="chat-send" onClick={finish} aria-label={t('Send voice message')}><Icon name="send" /></button>
    </> : <>
      <button type="button" className="chat-tool" onClick={attach} aria-label={t('Attach a photo or file')}><Icon name="paperclip" /></button>
      <textarea rows={1} value={draft} maxLength={2000} placeholder={t('Write a message…')} aria-label={t('Write a message…')}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }} />
      {!draft.trim() && canVoice
        ? <button type="button" className="chat-send voice" onClick={record} aria-label={t('Record a voice message')}><Icon name="mic" /></button>
        : <button type="submit" className="chat-send" disabled={sending || !draft.trim()} aria-label={t('Send')}><Icon name="send" /></button>}
    </>}
  </form>
}
