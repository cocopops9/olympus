// Olympus: what a message carries besides words (api/chat.js attachments): a photo, a video, a
// voice message or a file. The bytes are fetched with the session when the message is on screen
// (a video when it is played) and kept for the visit, so the conversation asking again every few
// seconds never downloads twice.
//
// A photo or a video sent to view once is never fetched by itself and never kept: the one it was
// sent to taps it, it opens full screen, and when it is closed its copy in the phone's memory is
// let go. The server gives it one time only (api/chat.js openOnce), so it cannot come back.
import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { chatMedia, chatErrorText } from '../lib/social.js'
import { MOBILE, shareExportBlob } from '../lib/mobile.js'
import { fmtSecs, fmtBytes } from '../lib/voice-note.js'
import Icon from './Icon.jsx'
import { clock } from './Song.jsx'

const urls = new Map()   // 'peer|message' -> Promise<{ url, blob }>
export function mediaOf(peer, id) {
  const key = peer + '|' + id
  if (!urls.has(key)) {
    urls.set(key, chatMedia(peer, id).then(blob => ({ blob, url: URL.createObjectURL(blob) }), e => { urls.delete(key); throw e }))
  }
  return urls.get(key)
}
/** A file chosen here and sent: shown from the phone's own copy, not downloaded again. */
export function rememberMedia(peer, id, blob) {
  urls.set(peer + '|' + id, Promise.resolve({ blob, url: URL.createObjectURL(blob) }))
}

function useMedia(peer, id, on = true) {
  const [m, setM] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!on || id == null) return
    let live = true
    mediaOf(peer, id).then(x => { if (live) setM(x) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [peer, id, on])
  return { m, failed }
}

function openPhoto(url) {
  useUI.getState().openSheet(close => (
    <div className="mviewer" role="dialog" aria-modal="true" aria-label={t('Photo')}>
      <div className="mviewer-bar">
        <button type="button" className="iconbtn" aria-label={t('Close')} onClick={close}><Icon name="xmark" /></button>
        <span /><span style={{ width: 36 }} />
      </div>
      <div className="mviewer-stage"><div className="exmedia viewer"><img src={url} alt="" /></div></div>
    </div>
  ), { kind: 'viewer' })
}

function Photo({ peer, id, local }) {
  const { m, failed } = useMedia(peer, id, !local)
  const url = local || m?.url
  return <button type="button" className="chat-a-photo" onClick={() => url && openPhoto(url)} aria-label={t('Open photo')}>
    {url ? <img src={url} alt="" /> : <span className="chat-a-wait">{failed ? <Icon name="image" /> : <i className="spin" />}</span>}
  </button>
}

// One voice message playing at a time, as in every messaging app.
let current = null
function Voice({ peer, id, secs, mine, local }) {
  const [on, setOn] = useState(false)
  const [load, setLoad] = useState(!!local)
  const [pos, setPos] = useState(0)
  const { m, failed } = useMedia(peer, id, load && !local)
  const audio = useRef(null)
  const url = local || m?.url
  useEffect(() => () => { audio.current?.pause(); if (current === audio.current) current = null }, [])
  useEffect(() => {
    if (!url || !load || !on) return
    const a = audio.current
    if (!a) return
    if (current && current !== a) current.pause()
    current = a
    a.play().catch(() => setOn(false))
  }, [url, load, on])
  const toggle = () => {
    if (on) { audio.current?.pause(); setOn(false); return }
    setLoad(true); setOn(true)
  }
  const shown = on || pos > 0 ? pos : secs
  // Twenty bars of a fixed, pleasant shape: the file is not decoded just to draw them.
  const bars = [4, 7, 10, 6, 12, 8, 14, 9, 6, 11, 13, 7, 9, 12, 5, 10, 8, 6, 9, 5]
  const done = secs ? Math.min(1, pos / secs) : 0
  return <div className={'chat-a-voice' + (mine ? ' mine' : '')}>
    <button type="button" className="chat-a-play" onClick={toggle} disabled={failed} aria-label={on ? t('Pause') : t('Play voice message')}>
      {on && !url ? <i className="spin" /> : <Icon name={on ? 'pauseFill' : 'playFill'} />}
    </button>
    <span className="chat-a-wave" aria-hidden="true">
      {bars.map((h, i) => <i key={i} style={{ height: h * 1.6 + 'px' }} className={i / bars.length < done ? 'on' : ''} />)}
    </span>
    <span className="chat-a-time">{fmtSecs(shown)}</span>
    {url && <audio ref={audio} src={url} preload="auto"
      onTimeUpdate={e => setPos(e.currentTarget.currentTime)}
      onEnded={() => { setOn(false); setPos(0) }} onPause={() => setOn(false)} />}
  </div>
}

function File({ peer, id, name, size, local }) {
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (busy) return
    setBusy(true)
    try {
      const blob = local || (await mediaOf(peer, id)).blob
      if (MOBILE) await shareExportBlob(blob, name || 'file')
      else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob); a.download = name || 'file'; a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 60000)
      }
    } catch (e) { if (!/cancel/i.test(String(e?.message))) useUI.getState().toast(t('Could not open the file.')) } finally { setBusy(false) }
  }
  return <button type="button" className="chat-a-file" onClick={save} aria-label={t('Open {0}', name || '')}>
    <span className="chat-a-file-i">{busy ? <i className="spin" /> : <Icon name="doc" />}</span>
    <span className="chat-a-file-m"><b>{name || t('File')}</b><small>{fmtBytes(size || 0)}</small></span>
    <Icon name="download" className="chat-a-file-d" />
  </button>
}

// One video playing at a time here too.
let playingVideo = null
function ChatVideo({ peer, id, secs, local }) {
  const [load, setLoad] = useState(false)
  const { m, failed } = useMedia(peer, id, load && !local)
  const el = useRef(null)
  const url = local || (load ? m?.url : null)
  useEffect(() => () => { if (playingVideo === el.current) playingVideo = null }, [])
  const onPlay = () => { if (playingVideo && playingVideo !== el.current) { try { playingVideo.pause() } catch { /* gone */ } } playingVideo = el.current }
  if (url && (load || local)) {
    return <div className="chat-a-video">
      <video ref={el} src={url} controls playsInline preload="metadata" autoPlay={load} onPlay={onPlay} />
    </div>
  }
  return <button type="button" className="chat-a-video cover" onClick={() => setLoad(true)} aria-label={t('Play video')}>
    <span className="chat-a-play big">{load && !failed ? <i className="spin" /> : <Icon name={failed ? 'reset' : 'playFill'} />}</span>
    <span className="chat-a-len">{failed ? t('Tap to try again') : clock(secs || 0)}</span>
  </button>
}

// Fetched here, never through mediaOf: a view-once photo or video must not stay in a cache. Its
// copy in memory is let go when the viewer goes, however it is closed.
function openOnce(peer, message, onOpened) {
  useUI.getState().openSheet(close => <OnceViewer peer={peer} id={message.id} kind={message.attachment.kind} onOpened={onOpened} close={close} />, { kind: 'viewer' })
}

function OnceViewer({ peer, id, kind, onOpened, close }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let live = true, made = null
    chatMedia(peer, id).then(blob => {
      onOpened()
      if (!live) return
      made = URL.createObjectURL(blob)
      setUrl(made)
    }, e => {
      if ((e?.data?.code || e?.code) === 'once-opened') onOpened()
      if (live) setError(chatErrorText(e, t))
    })
    return () => { live = false; if (made) URL.revokeObjectURL(made) }
  }, [])
  // Not offered to be saved or dragged out: a long press on it does nothing.
  const guard = { onContextMenu: e => e.preventDefault(), draggable: false }
  return <div className="mviewer once" role="dialog" aria-modal="true" aria-label={kind === 'video' ? t('View-once video') : t('View-once photo')}>
    <div className="mviewer-bar">
      <button type="button" className="iconbtn" aria-label={t('Close')} onClick={close}><Icon name="xmark" /></button>
      <span className="chat-once-t"><b className="chat-once-1">1</b>{kind === 'video' ? t('View-once video') : t('View-once photo')}</span><span style={{ width: 36 }} />
    </div>
    <div className="mviewer-stage">
      {error ? <div className="empty">{error}</div>
        : !url ? <i className="spin" />
          : kind === 'video'
            ? <video src={url} autoPlay playsInline controls controlsList="nodownload noplaybackrate" disablePictureInPicture {...guard} className="chat-once-media" />
            : <img src={url} alt="" {...guard} className="chat-once-media" />}
    </div>
    <p className="chat-once-note small">{t('It can be opened once. When you close it, it is gone.')}</p>
  </div>
}

/**
 * A photo or video sent to view once. The sender sees whether it was opened; the one it was sent to
 * taps it once to open it.
 */
function Once({ peer, message }) {
  const a = message.attachment
  const [openedHere, setOpenedHere] = useState(false)
  const opened = a.opened || openedHere
  const label = a.kind === 'video' ? t('View-once video') : t('View-once photo')
  const canOpen = !message.mine && !opened && !message.pending
  const state = message.pending ? t('Sending…') : opened ? t('Opened') : message.mine ? t('Not opened yet') : t('Tap to open')
  return <button type="button" className={'chat-a-once' + (opened ? ' opened' : '')} disabled={!canOpen}
    onClick={() => canOpen && openOnce(peer, message, () => setOpenedHere(true))} aria-label={label + ', ' + state}>
    <span className="chat-a-once-i">{opened ? <Icon name="check" /> : <b className="chat-once-1">1</b>}</span>
    <span className="chat-a-once-m"><b>{label}</b><small>{state}</small></span>
    <Icon name={a.kind === 'video' ? 'video' : 'image'} className="chat-a-once-k" />
  </button>
}

/** A message's attachment. `local` is the phone's own copy of what it just sent (a URL or a blob). */
export function ChatAttachment({ peer, message, local }) {
  const a = message.attachment
  if (!a) return null
  if (a.once) return <Once peer={peer} message={message} />
  if (a.kind === 'image') return <Photo peer={peer} id={message.id} local={local} />
  if (a.kind === 'video') return <ChatVideo peer={peer} id={message.id} secs={a.secs} local={local} />
  if (a.kind === 'audio') return <Voice peer={peer} id={message.id} secs={a.secs} mine={message.mine} local={local} />
  return <File peer={peer} id={message.id} name={a.name} size={a.size} local={local instanceof Blob ? local : null} />
}

/** How the list of conversations words the latest message when it is an attachment. */
export function attachmentLabel(kind, once = false) {
  if (once) return kind === 'video' ? t('View-once video') : t('View-once photo')
  return kind === 'image' ? t('Photo') : kind === 'video' ? t('Video') : kind === 'audio' ? t('Voice message') : kind === 'file' ? t('File') : ''
}

/** The icon of an attachment's kind, in the list of conversations. */
export const attachmentIcon = kind => (kind === 'image' ? 'image' : kind === 'video' ? 'video' : kind === 'audio' ? 'mic' : 'doc')
