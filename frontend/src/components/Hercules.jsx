// Olympus: Hercules, the free AI coach. His portrait sits above the tab bar on the main screens,
// in a slowly turning gold ring with an "AI" badge; once a day he says something from it in a
// speech bubble (lib/hercules-greeting.js). A tap opens the chat. The server answers
// (api/hercules.js) with the person's own training as context (lib/hercules-context.js); every
// profile has a number of messages a day, shown in the chat's header. The conversations stay on
// the device (lib/hercules.js) and the menu in the chat lists them.
//
// Shown only to a profile with a server account on a server that has Hercules set up, never
// during a workout or over the sign-in and first-launch screens.
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn, getLang } from '../lib/i18n.js'
import { socialReady } from '../lib/social.js'
import { herculesStatus, askHercules, loadChats, saveChats, putChat, dropChat } from '../lib/hercules.js'
import { SUGGESTIONS } from '../lib/hercules-context.js'
import { takeGreeting } from '../lib/hercules-greeting.js'
import portrait from '../assets/hercules.webp'
import Icon from './Icon.jsx'
import '../hercules.css'

const SHOWN_ON = ['/home', '/today', '/profile', '/workout', '/plan', '/stats', '/history', '/library']
const GREET_AFTER_MS = 1400
const GREET_FOR_MS = 9000

// The status is asked once per profile and session, and again after each answer.
let cached = { uid: null, status: null }
const setCached = (uid, status) => { cached = { uid, status } }
// The speech bubble is considered once per app start and profile.
let greetedFor = null
export const resetGreetingForTests = () => { greetedFor = null }

/** His portrait in the gold ring, with the AI badge. `size` is 'sm', 'md', 'lg' or 'xl'. */
export function Avatar({ size = 'md', live = false, badge = true }) {
  return <span className={'hc-av hc-av-' + size + (live ? ' live' : '')} aria-hidden="true">
    <img src={portrait} alt="" />
    {badge && <span className="hc-ai">AI</span>}
  </span>
}

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

const whenOf = ts => {
  const d = new Date(ts), now = new Date()
  try {
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(getLang(), { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString(getLang(), { day: 'numeric', month: 'short' })
  } catch { return d.toISOString().slice(0, 10) }
}

/** The list of conversations, in place of the messages. */
function Menu({ data, busy, open, start, remove }) {
  return <div className="hc-menu">
    <button className="hc-new" onClick={start} disabled={busy}>
      <Icon name="plusCircle" /><span>{t('New conversation')}</span>
    </button>
    <div className="hc-menu-h">{t('Conversations')}</div>
    {!data.chats.length && <div className="hc-menu-empty">{t('No conversations yet.')}</div>}
    {data.chats.map(c => <div key={c.id} className={'hc-conv' + (c.id === data.current ? ' on' : '')}>
      <button className="hc-conv-open" onClick={() => open(c.id)} disabled={busy}>
        <span className="hc-conv-t">{c.title || t('New conversation')}</span>
        <span className="hc-conv-d">{whenOf(c.ts)}</span>
      </button>
      <button className="iconbtn" onClick={() => remove(c.id)} disabled={busy} aria-label={t('Delete conversation')}><Icon name="trash" /></button>
    </div>)}
  </div>
}

function Chat({ close, ask }) {
  const user = useStore(s => s.user)
  const uid = user?.id
  // Opened from the bubble with a question to offer: a fresh conversation, so it is the first chip.
  const [data, setData] = useState(() => { const d = loadChats(uid); return ask ? { ...d, current: null } : d })
  const [menu, setMenu] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [status, setStatus] = useState(cached.uid === uid ? cached.status : null)
  const end = useRef(null)
  const input = useRef(null)
  const latest = useRef(data)
  const commit = d => { latest.current = d; setData(d); saveChats(uid, d) }

  const list = data.chats.find(c => c.id === data.current)?.messages || []

  useEffect(() => { herculesStatus().then(s => { setCached(uid, s); setStatus(s) }, () => {}) }, [uid])
  useEffect(() => { if (!menu) end.current?.scrollIntoView?.({ block: 'end' }) }, [list.length, busy, err, menu, data.current])

  const left = status ? status.left : null
  const send = async text => {
    const msg = String(text ?? draft).trim()
    if (!msg || busy) return
    if (left === 0) { setErr(errorText({ data: { code: 'hercules-limit' } })); return }
    const next = [...list, { role: 'user', content: msg, ts: Date.now() }]
    const sent = putChat(latest.current, latest.current.current, next)
    commit(sent); setDraft(''); setErr(''); setBusy(true)
    try {
      const r = await askHercules(next)
      commit(putChat(latest.current, sent.current, [...next, { role: 'assistant', content: r.reply, ts: Date.now() }]))
      const s = { on: true, left: r.left, perDay: r.perDay }
      setCached(uid, s); setStatus(s)
    } catch (e) {
      setErr(errorText(e))
      if (e?.data?.code === 'hercules-limit') { const s = { ...(status || {}), left: 0 }; setCached(uid, s); setStatus(s) }
    } finally {
      setBusy(false)
      input.current?.focus()
    }
  }
  const start = () => { commit({ ...latest.current, current: null }); setMenu(false); setErr('') }
  const open = id => { commit({ ...latest.current, current: id }); setMenu(false); setErr('') }
  const remove = id => commit(dropChat(latest.current, id))

  const suggestions = [...(ask ? [ask] : []), ...SUGGESTIONS()].filter((s, i, a) => a.indexOf(s) === i).slice(0, 4)
  const sub = left == null ? t('Online') : t('Online') + ' · ' + tn('{0} message left today', '{0} messages left today', left)

  return <div className="hc">
    <div className="hc-h">
      <Avatar size="md" live={busy} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="hc-name-row"><span className="hc-name">Hercules</span><span className="hc-tag"><Icon name="sparkles" />{t('AI coach')}</span></div>
        <div className="hc-sub"><i className="hc-dot" />{sub}</div>
      </div>
      <button className={'iconbtn' + (menu ? ' hc-on' : '')} onClick={() => setMenu(m => !m)} aria-label={t('Conversations')} aria-expanded={menu}><Icon name="list" /></button>
      <button className="iconbtn" onClick={close} aria-label={t('Close')}><Icon name="xmark" /></button>
    </div>
    {menu
      ? <Menu data={data} busy={busy} open={open} start={start} remove={remove} />
      : <div className="hc-list" data-nodrag>
        {!list.length && <div className="hc-hi">
          <Avatar size="xl" />
          <div className="hc-m him hc-hello">
            <strong>{t('Hi, I am Hercules.')}</strong>{' '}
            {t('Ask me anything about training, technique, nutrition or recovery. I know your workouts and your plan.')}
          </div>
          <div className="hc-sugg">
            {suggestions.map(s => <button key={s} className="chip nocap" onClick={() => send(s)}>{s}</button>)}
          </div>
        </div>}
        {list.map((m, i) => (m.role === 'user'
          ? <div key={i} className="hc-m me">{m.content}</div>
          : <div key={i} className="hc-row">
            {list[i - 1]?.role === 'assistant' ? <span className="hc-av-gap" /> : <Avatar size="sm" badge={false} />}
            <div className="hc-m him"><Rich text={m.content} /></div>
          </div>))}
        {busy && <div className="hc-row">
          <Avatar size="sm" badge={false} live />
          <div className="hc-m him hc-typing" aria-label={t('Hercules is writing…')}><i /><i /><i /></div>
        </div>}
        {err && <div className="hc-err" role="alert">{err}</div>}
        <div ref={end} />
      </div>}
    {!menu && <form className="hc-in" onSubmit={e => { e.preventDefault(); send() }}>
      <textarea ref={input} rows={1} maxLength={2000} value={draft} placeholder={t('Ask Hercules…')}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
      <button type="submit" className="hc-send" disabled={busy || !draft.trim()} aria-label={t('Send')}><Icon name="arrowUp" /></button>
    </form>}
    <div className="hc-note">{t('Hercules is an AI and can be wrong. For pain or health problems, see a doctor.')}</div>
  </div>
}

export const herculesSheet = ({ ask } = {}) => useUI.getState().openSheet(close => <Chat close={close} ask={ask} />)

export default function HerculesButton() {
  const loc = useLocation()
  const user = useStore(s => s.user)
  const ready = useStore(s => s.ready)
  const active = useStore(s => !!s.S.active)
  const sheets = useUI(s => s.sheets.length)
  const [on, setOn] = useState(cached.uid === user?.id ? !!cached.status?.on : false)
  const [greet, setGreet] = useState(null)
  const can = socialReady(user) && ready

  useEffect(() => {
    if (!can) { setOn(false); return }
    if (cached.uid === user.id && cached.status) { setOn(!!cached.status.on); return }
    let gone = false
    herculesStatus().then(s => { setCached(user.id, s); if (!gone) setOn(!!s.on) }, () => {})
    return () => { gone = true }
  }, [can, user?.id])

  const here = SHOWN_ON.includes(loc.pathname) && !(loc.pathname === '/workout' && active)
  const visible = on && here && sheets === 0

  // The speech bubble: a moment after he first appears, once a day, then gone by itself.
  useEffect(() => {
    if (!visible || greetedFor === user?.id) return
    const show = setTimeout(() => {
      greetedFor = user?.id
      const g = takeGreeting(user?.id, useStore.getState().S)
      if (g) setGreet(g)
    }, GREET_AFTER_MS)
    return () => clearTimeout(show)
  }, [visible, user?.id])
  useEffect(() => {
    if (!greet) return
    const hide = setTimeout(() => setGreet(null), GREET_FOR_MS)
    return () => clearTimeout(hide)
  }, [greet])

  if (!visible) return null
  const openChat = ask => { setGreet(null); herculesSheet({ ask }) }
  return <>
    {greet && <div className="hc-bubble" role="status">
      <button className="hc-bubble-t" onClick={() => openChat(greet.ask)}>{greet.text}</button>
      <button className="hc-bubble-x" onClick={() => setGreet(null)} aria-label={t('Close')}><Icon name="xmark" /></button>
    </div>}
    <button className="hc-fab" onClick={() => openChat()} aria-label={t('Ask Hercules, your coach')}>
      <Avatar size="lg" />
    </button>
  </>
}
