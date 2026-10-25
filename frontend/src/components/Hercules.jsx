// Olympus: Hercules, the free coach. A round portrait sits above the tab bar on the main
// screens; a tap opens the chat. The server answers (api/hercules.js) with the person's own
// training as context (lib/hercules-context.js); every profile has a number of messages a day,
// shown in the chat's header.
//
// Shown only to a profile with a server account on a server that has Hercules set up, never
// during a workout or over the sign-in and first-launch screens.
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { socialReady } from '../lib/social.js'
import { herculesStatus, askHercules, loadChat, saveChat, clearChat } from '../lib/hercules.js'
import { SUGGESTIONS } from '../lib/hercules-context.js'
import portrait from '../assets/hercules.webp'
import Icon from './Icon.jsx'
import '../hercules.css'

const SHOWN_ON = ['/home', '/today', '/profile', '/workout', '/plan', '/stats', '/history', '/library']

// The status is asked once per profile and session, and again after each answer.
let cached = { uid: null, status: null }
const setCached = (uid, status) => { cached = { uid, status } }

/** **bold**, line breaks, and "- " or "1. " lists: the little formatting the model uses. */
function Rich({ text }) {
  const blocks = String(text).split(/\n{2,}/)
  const inline = s => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') && part.length > 4
    ? <strong key={i}>{part.slice(2, -2)}</strong> : part))
  return blocks.map((b, i) => {
    const lines = b.split('\n').filter(l => l.trim() !== '')
    const bullet = /^\s*(?:[-*•]|\d+[.)])\s+/
    if (lines.length && lines.every(l => bullet.test(l))) {
      const ordered = /^\s*\d/.test(lines[0])
      const items = lines.map((l, j) => <li key={j}>{inline(l.replace(bullet, ''))}</li>)
      return ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>
    }
    return <p key={i}>{lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l.replace(bullet, '• '))}</span>)}</p>
  })
}

const errorText = e => {
  const code = e?.data?.code
  if (code === 'hercules-limit') return t('That was your last message for today. Hercules is back tomorrow.')
  if (code === 'hercules-busy') return t('Hercules is resting: many people asked him today. Try again later.')
  if (code === 'hercules-off') return t('Hercules is not available on this server.')
  if (e?.code === 'timeout') return t('Hercules took too long to answer. Try again.')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return t('No connection. Hercules needs the internet to answer.')
  return t('Hercules could not answer. Try again.')
}

function Chat({ close }) {
  const user = useStore(s => s.user)
  const [list, setList] = useState(() => loadChat(user?.id))
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [status, setStatus] = useState(cached.uid === user?.id ? cached.status : null)
  const end = useRef(null)
  const input = useRef(null)

  useEffect(() => { herculesStatus().then(s => { setCached(user?.id, s); setStatus(s) }, () => {}) }, [user?.id])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [list.length, busy, err])

  const left = status ? status.left : null
  const send = async text => {
    const msg = String(text ?? draft).trim()
    if (!msg || busy) return
    if (left === 0) { setErr(errorText({ data: { code: 'hercules-limit' } })); return }
    const next = [...list, { role: 'user', content: msg, ts: Date.now() }]
    setList(next); saveChat(user?.id, next); setDraft(''); setErr(''); setBusy(true)
    try {
      const r = await askHercules(next)
      const done = [...next, { role: 'assistant', content: r.reply, ts: Date.now() }]
      setList(done); saveChat(user?.id, done)
      const s = { on: true, left: r.left, perDay: r.perDay }
      setCached(user?.id, s); setStatus(s)
    } catch (e) {
      setErr(errorText(e))
      if (e?.data?.code === 'hercules-limit') { const s = { ...(status || {}), left: 0 }; setCached(user?.id, s); setStatus(s) }
    } finally {
      setBusy(false)
      input.current?.focus()
    }
  }
  const clear = () => { clearChat(user?.id); setList([]); setErr('') }

  return <div className="hc">
    <div className="hc-h">
      <img className="hc-face" src={portrait} alt="" />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="hc-name">Hercules</div>
        <div className="hc-sub">{left == null ? t('Your coach') : tn('{0} message left today', '{0} messages left today', left)}</div>
      </div>
      {list.length > 0 && <button className="iconbtn" onClick={clear} aria-label={t('New conversation')}><Icon name="note" /></button>}
      <button className="iconbtn" onClick={close} aria-label={t('Close')}><Icon name="xmark" /></button>
    </div>
    <div className="hc-list">
      {!list.length && <div className="hc-hi">
        <img src={portrait} alt="" />
        <h3>{t('Hi, I am Hercules.')}</h3>
        <p>{t('Ask me anything about training, technique, nutrition or recovery. I know your workouts and your plan.')}</p>
        <div className="hc-sugg">
          {SUGGESTIONS().map(s => <button key={s} className="chip nocap" onClick={() => send(s)}>{s}</button>)}
        </div>
      </div>}
      {list.map((m, i) => <div key={i} className={'hc-m ' + (m.role === 'user' ? 'me' : 'him')}>
        {m.role === 'user' ? m.content : <Rich text={m.content} />}
      </div>)}
      {busy && <div className="hc-m him hc-typing" aria-label={t('Hercules is writing…')}><i /><i /><i /></div>}
      {err && <div className="hc-err" role="alert">{err}</div>}
      <div ref={end} />
    </div>
    <form className="hc-in" onSubmit={e => { e.preventDefault(); send() }}>
      <textarea ref={input} rows={1} maxLength={2000} value={draft} placeholder={t('Ask Hercules…')}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
      <button type="submit" className="hc-send" disabled={busy || !draft.trim()} aria-label={t('Send')}><Icon name="arrowUp" /></button>
    </form>
    <div className="hc-note">{t('Hercules is an AI and can be wrong. For pain or health problems, see a doctor.')}</div>
  </div>
}

export const herculesSheet = () => useUI.getState().openSheet(close => <Chat close={close} />)

export default function HerculesButton() {
  const loc = useLocation()
  const user = useStore(s => s.user)
  const ready = useStore(s => s.ready)
  const active = useStore(s => !!s.S.active)
  const sheets = useUI(s => s.sheets.length)
  const [on, setOn] = useState(cached.uid === user?.id ? !!cached.status?.on : false)
  const can = socialReady(user) && ready

  useEffect(() => {
    if (!can) { setOn(false); return }
    if (cached.uid === user.id && cached.status) { setOn(!!cached.status.on); return }
    let gone = false
    herculesStatus().then(s => { setCached(user.id, s); if (!gone) setOn(!!s.on) }, () => {})
    return () => { gone = true }
  }, [can, user?.id])

  const here = SHOWN_ON.includes(loc.pathname) && !(loc.pathname === '/workout' && active)
  if (!on || !here || sheets > 0) return null
  return <button className="hc-fab" onClick={herculesSheet} aria-label={t('Ask Hercules, your coach')}>
    <img src={portrait} alt="" />
  </button>
}
