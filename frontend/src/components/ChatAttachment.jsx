// Olympus: what a message carries besides words (api/chat.js attachments): a photo, a voice
// message or a file. The bytes are fetched with the session when the message is on screen and
// kept for the visit, so the conversation asking again every few seconds never downloads twice.
import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { chatMedia } from '../lib/social.js'
import { MOBILE, shareExportBlob } from '../lib/mobile.js'
import { fmtSecs, fmtBytes } from '../lib/voice-note.js'
import Icon from './Icon.jsx'

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

/** A message's attachment. `local` is the phone's own copy of what it just sent (a URL or a blob). */
export function ChatAttachment({ peer, message, local }) {
  const a = message.attachment
  if (!a) return null
  if (a.kind === 'image') return <Photo peer={peer} id={message.id} local={local} />
  if (a.kind === 'audio') return <Voice peer={peer} id={message.id} secs={a.secs} mine={message.mine} local={local} />
  return <File peer={peer} id={message.id} name={a.name} size={a.size} local={local instanceof Blob ? local : null} />
}

/** How the list of conversations words the latest message when it is an attachment. */
export function attachmentLabel(kind) {
  return kind === 'image' ? t('Photo') : kind === 'audio' ? t('Voice message') : kind === 'file' ? t('File') : ''
}
