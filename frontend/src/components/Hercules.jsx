// Olympus: Hercules and Athena, the free AI coaches. The portrait of the one talked to last sits above
// the tab bar on the main screens, in a slowly turning gold ring with an "AI" badge; once a day the
// coach says something from it in a speech bubble (lib/hercules-greeting.js). A tap opens the chat. The server answers
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
import { herculesStatus, askHercules, loadChats, saveChats, putChat, dropChat, lastCoach, setLastCoach, COACH_IDS } from '../lib/hercules.js'
import { suggestionsFor } from '../lib/hercules-context.js'
import { takeGreeting } from '../lib/hercules-greeting.js'
import hercules from '../assets/hercules.webp'
import athena from '../assets/athena.webp'
import Icon from './Icon.jsx'
import '../hercules.css'

const SHOWN_ON = ['/home', '/today', '/profile', '/workout', '/plan', '/stats', '/history', '/library']
const GREET_AFTER_MS = 1400
const GREET_FOR_MS = 9000

export const COACHES = {
  hercules: { name: 'Hercules', portrait: hercules },
  athena: { name: 'Athena', portrait: athena },
}
const coachName = id => (COACHES[id] || COACHES.hercules).name

// The status of each coach is asked once per profile and session, and again after each answer.
let cached = { uid: null, status: {} }
const statusOf = (uid, coach) => (cached.uid === uid ? cached.status[coach] || null : null)
const setCached = (uid, coach, status) => { cached = { uid, status: { ...(cached.uid === uid ? cached.status : {}), [coach]: status } } }
// The speech bubble is considered once per app start and profile.
let greetedFor = null
export const resetGreetingForTests = () => { greetedFor = null; cached = { uid: null, status: {} } }

/** The coach's portrait in the gold ring, with the AI badge. `size` is 'sm', 'md', 'lg' or 'xl'. */
export function Avatar({ size = 'md', live = false, badge = true, coach = 'hercules' }) {
  return <span className={'hc-av hc-av-' + size + (live ? ' live' : '')} aria-hidden="true">
    <img src={(COACHES[coach] || COACHES.hercules).portrait} alt="" />
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

const errorText = (e, name) => {
  const code = e?.data?.code
  if (code === 'hercules-limit') return t('That was your last message for today. {0} is back tomorrow.', name)
  if (code === 'hercules-busy') return t('{0} is resting: many people asked today. Try again later.', name)
  if (code === 'hercules-off') return t('{0} is not available on this server.', name)
  if (e?.code === 'timeout') return t('{0} took too long to answer. Try again.', name)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return t('No connection. {0} needs the internet to answer.', name)
  return t('{0} could not answer. Try again.', name)
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

/** The two coaches as pills, to talk to the other one. */
function Switch({ coach, ons, pick }) {
  return <div className="hc-switch" role="tablist">
    {COACH_IDS.map(id => <button key={id} role="tab" aria-selected={id === coach} className={'hc-pill' + (id === coach ? ' on' : '')}
      onClick={() => id !== coach && pick(id)} disabled={!ons[id]}>
      <Avatar size="xs" badge={false} coach={id} />{coachName(id)}
    </button>)}
  </div>
}

function Chat({ close, ask, coach, ons, pick }) {
  const user = useStore(s => s.user)
  const uid = user?.id
  const name = coachName(coach)
  // Opened from the bubble with a question to offer: a fresh conversation, so it is the first chip.
  const [data, setData] = useState(() => { const d = loadChats(uid, coach); return ask ? { ...d, current: null } : d })
  const [menu, setMenu] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [status, setStatus] = useState(() => statusOf(uid, coach))
  const end = useRef(null)
  const input = useRef(null)
  const latest = useRef(data)
  const commit = d => { latest.current = d; setData(d); saveChats(uid, d, coach) }

  const list = data.chats.find(c => c.id === data.current)?.messages || []

  useEffect(() => { herculesStatus(coach).then(s => { setCached(uid, coach, s); setStatus(s) }, () => {}) }, [uid, coach])
  useEffect(() => { if (!menu) end.current?.scrollIntoView?.({ block: 'end' }) }, [list.length, busy, err, menu, data.current])

  const left = status ? status.left : null
  const send = async text => {
    const msg = String(text ?? draft).trim()
    if (!msg || busy) return
    if (left === 0) { setErr(errorText({ data: { code: 'hercules-limit' } }, name)); return }
    const next = [...list, { role: 'user', content: msg, ts: Date.now() }]
    const sent = putChat(latest.current, latest.current.current, next)
    commit(sent); setDraft(''); setErr(''); setBusy(true); setLastCoach(uid, coach)
    try {
      const r = await askHercules(next, coach)
      commit(putChat(latest.current, sent.current, [...next, { role: 'assistant', content: r.reply, ts: Date.now() }]))
      const s = { on: true, left: r.left, perDay: r.perDay }
      setCached(uid, coach, s); setStatus(s)
    } catch (e) {
      setErr(errorText(e, name))
      if (e?.data?.code === 'hercules-limit') { const s = { ...(status || {}), left: 0 }; setCached(uid, coach, s); setStatus(s) }
    } finally {
      setBusy(false)
      input.current?.focus()
    }
  }
  const start = () => { commit({ ...latest.current, current: null }); setMenu(false); setErr('') }
  const open = id => { commit({ ...latest.current, current: id }); setMenu(false); setErr('') }
  const remove = id => commit(dropChat(latest.current, id))

  const suggestions = [...(ask ? [ask] : []), ...suggestionsFor(coach)].filter((s, i, a) => a.indexOf(s) === i).slice(0, 4)
  const sub = left == null ? t('Online') : t('Online') + ' · ' + tn('{0} message left today', '{0} messages left today', left)
  const both = COACH_IDS.every(id => ons[id])

  return <div className="hc" data-coach={coach}>
    <div className="hc-h">
      <Avatar size="md" live={busy} coach={coach} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="hc-name-row"><span className="hc-name">{name}</span><span className="hc-tag"><Icon name="sparkles" />{t('AI coach')}</span></div>
        <div className="hc-sub"><i className="hc-dot" />{sub}</div>
      </div>
      <button className={'iconbtn' + (menu ? ' hc-on' : '')} onClick={() => setMenu(m => !m)} aria-label={t('Conversations')} aria-expanded={menu}><Icon name="list" /></button>
      <button className="iconbtn" onClick={close} aria-label={t('Close')}><Icon name="xmark" /></button>
    </div>
    {both && <Switch coach={coach} ons={ons} pick={pick} />}
    {menu
      ? <Menu data={data} busy={busy} open={open} start={start} remove={remove} />
      : <div className="hc-list" data-nodrag>
        {!list.length && <div className="hc-hi">
          <Avatar size="xl" coach={coach} />
          <div className="hc-role">{coach === 'athena' ? t('Your strategist: the data, the plan and the why.') : t('Your motivator: training, technique and nutrition.')}</div>
          <div className="hc-m him hc-hello">
            <strong>{t('Hi, I am {0}.', name)}</strong>{' '}
            {t('Ask me anything about training, technique, nutrition or recovery. I know your workouts and your plan.')}
          </div>
          <div className="hc-sugg">
            {suggestions.map(s => <button key={s} className="chip nocap" onClick={() => send(s)}>{s}</button>)}
          </div>
        </div>}
        {list.map((m, i) => (m.role === 'user'
          ? <div key={i} className="hc-m me">{m.content}</div>
          : <div key={i} className="hc-row">
            {list[i - 1]?.role === 'assistant' ? <span className="hc-av-gap" /> : <Avatar size="sm" badge={false} coach={coach} />}
            <div className="hc-m him"><Rich text={m.content} /></div>
          </div>))}
        {busy && <div className="hc-row">
          <Avatar size="sm" badge={false} live coach={coach} />
          <div className="hc-m him hc-typing" aria-label={t('{0} is writing…', name)}><i /><i /><i /></div>
        </div>}
        {err && <div className="hc-err" role="alert">{err}</div>}
        <div ref={end} />
      </div>}
    {!menu && <form className="hc-in" onSubmit={e => { e.preventDefault(); send() }}>
      <textarea ref={input} rows={1} maxLength={2000} value={draft} placeholder={t('Ask {0}…', name)}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
      <button type="submit" className="hc-send" disabled={busy || !draft.trim()} aria-label={t('Send')}><Icon name="arrowUp" /></button>
    </form>}
    <div className="hc-note">{t('{0} is an AI and can be wrong. For pain or health problems, see a doctor.', name)}</div>
  </div>
}

/** The chat sheet: one coach at a time, and the pills to change. */
function CoachSheet({ close, ask, first, ons: initial }) {
  const user = useStore(s => s.user)
  const [coach, setCoach] = useState(first)
  const [ons, setOns] = useState(initial)
  // The other coach may not have been asked about yet.
  useEffect(() => {
    let gone = false
    for (const id of COACH_IDS) if (!(id in ons)) herculesStatus(id).then(s => { setCached(user?.id, id, s); if (!gone) setOns(o => ({ ...o, [id]: !!s.on })) }, () => {})
    return () => { gone = true }
  }, [])
  const pick = id => { setCoach(id); setLastCoach(user?.id, id) }
  // `ask` is a question for the coach it was offered by, and only for the first conversation.
  return <Chat key={coach} close={close} ask={coach === first ? ask : undefined} coach={coach} ons={ons} pick={pick} />
}

/** Opens the chat on `coach` (the one talked to last by default). */
export const herculesSheet = ({ ask, coach } = {}) => {
  const uid = useStore.getState().user?.id
  const first = COACH_IDS.includes(coach) ? coach : (lastCoach(uid) || 'hercules')
  const ons = Object.fromEntries(COACH_IDS.map(id => [id, statusOf(uid, id)?.on]).filter(([, v]) => v !== undefined && v !== null))
  return useUI.getState().openSheet(close => <CoachSheet close={close} ask={ask} first={first} ons={ons} />)
}

export default function HerculesButton() {
  const loc = useLocation()
  const user = useStore(s => s.user)
  const ready = useStore(s => s.ready)
  const active = useStore(s => !!s.S.active)
  const sheets = useUI(s => s.sheets.length)
  const [ons, setOns] = useState(() => Object.fromEntries(COACH_IDS.map(id => [id, !!statusOf(user?.id, id)?.on])))
  const [greet, setGreet] = useState(null)
  const can = socialReady(user) && ready

  useEffect(() => {
    if (!can) { setOns({}); return }
    let gone = false
    for (const id of COACH_IDS) {
      const known = statusOf(user.id, id)
      if (known) { setOns(o => ({ ...o, [id]: !!known.on })); continue }
      herculesStatus(id).then(s => { setCached(user.id, id, s); if (!gone) setOns(o => ({ ...o, [id]: !!s.on })) }, () => {})
    }
    return () => { gone = true }
  }, [can, user?.id])

  // The one on the button: the one talked to last, when it is on.
  const last = lastCoach(user?.id)
  const coach = last && ons[last] ? last : COACH_IDS.find(id => ons[id]) || 'hercules'
  const on = COACH_IDS.some(id => ons[id])
  const here = SHOWN_ON.includes(loc.pathname) && !(loc.pathname === '/workout' && active)
  const visible = on && here && sheets === 0

  // The speech bubble: a moment after the coach first appears, once a day, then gone by itself.
  useEffect(() => {
    if (!visible || greetedFor === user?.id) return
    const show = setTimeout(() => {
      greetedFor = user?.id
      const g = takeGreeting(user?.id, useStore.getState().S, undefined, coachName(coach))
      if (g) setGreet({ ...g, coach })
    }, GREET_AFTER_MS)
    return () => clearTimeout(show)
  }, [visible, user?.id])
  useEffect(() => {
    if (!greet) return
    const hide = setTimeout(() => setGreet(null), GREET_FOR_MS)
    return () => clearTimeout(hide)
  }, [greet])

  if (!visible) return null
  const openChat = (ask, c) => { setGreet(null); herculesSheet({ ask, coach: c || coach }) }
  return <>
    {greet && <div className="hc-bubble" role="status">
      <button className="hc-bubble-t" onClick={() => openChat(greet.ask, greet.coach)}>{greet.text}</button>
      <button className="hc-bubble-x" onClick={() => setGreet(null)} aria-label={t('Close')}><Icon name="xmark" /></button>
    </div>}
    <button className="hc-fab" onClick={() => openChat()} aria-label={t('Ask {0}, your coach', coachName(coach))}>
      <Avatar size="lg" coach={coach} />
    </button>
  </>
}
