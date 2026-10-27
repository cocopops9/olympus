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
import { isOwn, ownCoach, askOwnCoach, loadOwnCoaches } from '../lib/own-coach.js'
import { ownCoachSheet } from './OwnCoach.jsx'
import { avatarUrl } from '../lib/god-avatars.js'
import hercules from '../assets/hercules.webp'
import athena from '../assets/athena.webp'
import Icon from './Icon.jsx'
import '../hercules.css'
import { coachGoalsSheet } from './CoachGoals.jsx'
import { coachProfileOf, TRAINING_STYLES, PHASES } from '../lib/coach-profile.js'
import CoachActions from './CoachActions.jsx'
import { splitActions } from '../lib/coach-actions.js'

const SHOWN_ON = ['/home', '/today', '/profile', '/workout', '/plan', '/stats', '/history', '/library']
const GREET_AFTER_MS = 1400
const GREET_FOR_MS = 9000

export const COACHES = {
  hercules: { name: 'Hercules', portrait: hercules },
  athena: { name: 'Athena', portrait: athena },
}
// A coach of your own (lib/own-coach.js): its name and portrait, read from this device.
const ownOf = id => (isOwn(id) ? ownCoach(useStore.getState().user?.id, id) : null)
export const coachName = id => (isOwn(id) ? ownOf(id)?.name || 'Coach' : (COACHES[id] || COACHES.hercules).name)
export const coachPortrait = id => (isOwn(id) ? avatarUrl(ownOf(id)?.avatar) : (COACHES[id] || COACHES.hercules).portrait)

// The status of each coach is asked once per profile and session, and again after each answer.
let cached = { uid: null, status: {} }
export const statusOf = (uid, coach) => (cached.uid === uid ? cached.status[coach] || null : null)
export const setCached = (uid, coach, status) => { cached = { uid, status: { ...(cached.uid === uid ? cached.status : {}), [coach]: status } } }
// The floating button can be put away (dragged onto the X) and brought back from the full-screen
// coach (views/CoachAI.jsx); where it was dragged to is kept too. Both per device.
const FAB_KEY = 'olympus_coach_fab'
const readFab = () => { try { return JSON.parse(localStorage.getItem(FAB_KEY) || '{}') || {} } catch { return {} } }
const writeFab = v => { try { localStorage.setItem(FAB_KEY, JSON.stringify({ ...readFab(), ...v })) } catch { /* a convenience */ } window.dispatchEvent(new Event('olympus:fab')) }
export const fabHidden = () => readFab().hidden === true
export const setFabHidden = on => writeFab({ hidden: !!on })
// The speech bubble is considered once per app start and profile.
let greetedFor = null
export const resetGreetingForTests = () => { greetedFor = null; cached = { uid: null, status: {} } }

/** The coach's portrait in the gold ring, with the AI badge. `size` is 'sm', 'md', 'lg' or 'xl'. */
export function Avatar({ size = 'md', live = false, badge = true, coach = 'hercules' }) {
  const src = coachPortrait(coach)
  return <span className={'hc-av hc-av-' + size + (live ? ' live' : '')} aria-hidden="true">
    {src ? <img src={src} alt="" draggable={false} /> : <span className="hc-av-letter">{coachName(coach).slice(0, 1).toUpperCase()}</span>}
    {badge && <span className="hc-ai">AI</span>}
  </span>
}

/** **bold**, line breaks, and "- " or "1. " lists: the little formatting the model uses. */
export function Rich({ text }) {
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

export const errorText = (e, name) => {
  const code = e?.data?.code
  // A coach of your own: what its provider said.
  if (code === 'own-key') return t('{0}: the provider refused the API key. Check it in the coach settings.', name)
  if (code === 'own-limit') return t('{0}: your provider says you are over its limit for now.', name)
  if (code === 'own-network') return t('{0}: the provider could not be reached. Check the address, and your connection.', name)
  if (code === 'own-failed') return t('{0} could not answer: {1}', name, String(e?.data?.message || '').slice(0, 160))
  if (code === 'hercules-limit') return t('That was your last message for today. {0} is back tomorrow.', name)
  if (code === 'hercules-busy') return t('{0} is resting: many people asked today. Try again later.', name)
  if (code === 'hercules-off') return t('{0} is not available on this server.', name)
  if (e?.code === 'timeout') return t('{0} took too long to answer. Try again.', name)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return t('No connection. {0} needs the internet to answer.', name)
  return t('{0} could not answer. Try again.', name)
}

export const whenOf = ts => {
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

/** A coach's message: its text, and the changes it proposes as cards (lib/coach-actions.js). */
export function Reply({ m, onApplied }) {
  const { text, actions } = splitActions(m.content)
  return <>
    {text && <Rich text={text} />}
    <CoachActions actions={actions} applied={m.applied || []} onApplied={onApplied} />
  </>
}

/** What the coaches know you train for (lib/coach-profile.js), and the way to tell or change it. */
export function GoalsLine() {
  const S = useStore(st => st.S)
  const p = coachProfileOf(S)
  const parts = [...p.styles.map(id => t(TRAINING_STYLES.find(x => x.id === id).label)), ...(p.phase ? [t(PHASES.find(x => x.id === p.phase).label)] : [])]
  const said = parts.length || p.goals
  return <button className="hc-goals" onClick={coachGoalsSheet}>
    <Icon name="target" />
    <span className="grow">{said
      ? <><b>{t('Training for')}:</b> {parts.join(' · ') || p.goals.slice(0, 60) + (p.goals.length > 60 ? '…' : '')}</>
      : t('Tell your coaches what you train for: style, phase, goals, what is coming up.')}</span>
    <Icon name="chevronRight" />
  </button>
}

/** The coaches as pills, to talk to another one, and + to set up one of your own. */
function Switch({ coach, ons, pick, own, onAdd }) {
  return <div className="hc-switch" role="tablist">
    {[...COACH_IDS.filter(id => ons[id]), ...own.map(c => c.id)].map(id => <button key={id} role="tab" aria-selected={id === coach} className={'hc-pill' + (id === coach ? ' on' : '')}
      onClick={() => id !== coach && pick(id)}>
      <Avatar size="xs" badge={false} coach={id} />{coachName(id)}
    </button>)}
    <button className="hc-pill hc-add" onClick={onAdd} aria-label={t('Add your own AI coach')} title={t('Add your own AI coach')}><Icon name="plus" /></button>
  </div>
}

/** The coaches of your own on this device, kept up to date when one is added or changed. */
export function useOwnCoaches() {
  const uid = useStore(s => s.user?.id)
  const [list, setList] = useState(() => loadOwnCoaches(uid))
  useEffect(() => {
    const sync = () => setList(loadOwnCoaches(uid))
    sync()
    window.addEventListener('olympus:own-coaches', sync)
    return () => window.removeEventListener('olympus:own-coaches', sync)
  }, [uid])
  return list
}

/**
 * One coach's conversations and the sending of a message, shared by the chat sheet and the full
 * screen (views/CoachAI.jsx). `ask`: open on a fresh conversation (a question offered by the
 * bubble). `chatId`: open on that conversation.
 */
export function useCoachChat({ coach, ask, chatId, onSent } = {}) {
  const user = useStore(s => s.user)
  const uid = user?.id
  const name = coachName(coach)
  const [data, setData] = useState(() => {
    const d = loadChats(uid, coach)
    if (ask) return { ...d, current: null }
    if (chatId && d.chats.some(c => c.id === chatId)) return { ...d, current: chatId }
    return d
  })
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [status, setStatus] = useState(() => statusOf(uid, coach))
  const input = useRef(null)
  const latest = useRef(data)
  const commit = d => { latest.current = d; setData(d); saveChats(uid, d, coach) }
  const list = data.chats.find(c => c.id === data.current)?.messages || []

  const own = isOwn(coach)
  useEffect(() => { if (!own) herculesStatus(coach).then(s => { setCached(uid, coach, s); setStatus(s) }, () => {}) }, [uid, coach])

  // Your own coach has no daily limit: your provider decides.
  const left = own ? null : status ? status.left : null
  const send = async text => {
    const msg = String(text ?? draft).trim()
    if (!msg || busy) return
    if (left === 0) { setErr(errorText({ data: { code: 'hercules-limit' } }, name)); return }
    const next = [...list, { role: 'user', content: msg, ts: Date.now() }]
    const sent = putChat(latest.current, latest.current.current, next)
    commit(sent); setDraft(''); setErr(''); setBusy(true); setLastCoach(uid, coach)
    onSent?.()
    try {
      const r = own ? await askOwnCoach(ownCoach(uid, coach) || {}, next) : await askHercules(next, coach)
      commit(putChat(latest.current, sent.current, [...next, { role: 'assistant', content: r.reply, ts: Date.now() }]))
      if (!own) { const s = { on: true, left: r.left, perDay: r.perDay }; setCached(uid, coach, s); setStatus(s) }
    } catch (e) {
      setErr(errorText(e, name))
      if (e?.data?.code === 'hercules-limit') { const s = { ...(status || {}), left: 0 }; setCached(uid, coach, s); setStatus(s) }
    } finally {
      setBusy(false)
      input.current?.focus()
    }
  }
  const start = () => { commit({ ...latest.current, current: null }); setErr('') }
  const open = id => { commit({ ...latest.current, current: id }); setErr('') }
  const remove = id => commit(dropChat(latest.current, id))
  // A change the coach proposed was applied (components/CoachActions.jsx): kept on its message.
  const markApplied = (msgIndex, k) => {
    const cur = latest.current
    const msgs = cur.chats.find(c => c.id === cur.current)?.messages || []
    commit(putChat(cur, cur.current, msgs.map((m, i) => (i === msgIndex ? { ...m, applied: [...new Set([...(m.applied || []), k])] } : m))))
  }
  // Between sets the questions are about the workout in progress (lib/coach-profile.js gives the
  // coach its sets as they stand).
  const live = useStore(st => !!st.S.active && !st.S.active.backfill && !st.S.active.editingWorkoutId)
  const suggestions = [...(ask ? [ask] : []), ...suggestionsFor(coach, { live })].filter((x, i, a) => a.indexOf(x) === i).slice(0, 4)
  return { uid, name, data, list, draft, setDraft, busy, err, left, status, input, send, start, open, remove, suggestions, markApplied }
}

function Chat({ close, ask, coach, ons, pick, own }) {
  const c = useCoachChat({ coach, ask })
  const { name, data, list, draft, setDraft, busy, err, left, input, send, remove, suggestions } = c
  const [menu, setMenu] = useState(false)
  const end = useRef(null)
  const start = () => { c.start(); setMenu(false) }
  const open = id => { c.open(id); setMenu(false) }
  useEffect(() => { if (!menu) end.current?.scrollIntoView?.({ block: 'end' }) }, [list.length, busy, err, menu, data.current])
  // The same conversation, full screen (views/CoachAI.jsx).
  const expand = () => { close(); setTimeout(() => { window.location.hash = '#/ai?c=' + coach + (data.current ? '&chat=' + data.current : '') }, 0) }

  const sub = left == null ? t('Online') : t('Online') + ' · ' + tn('{0} message left today', '{0} messages left today', left)
  const addOwn = () => ownCoachSheet(null, saved => { if (saved) pick(saved.id) })
  const editOwn = () => ownCoachSheet(ownCoach(useStore.getState().user?.id, coach), saved => pick(saved ? saved.id : 'hercules'))

  return <div className="hc" data-coach={coach}>
    <div className="hc-h">
      <Avatar size="md" live={busy} coach={coach} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="hc-name-row"><span className="hc-name">{name}</span><span className="hc-tag"><Icon name="sparkles" />{t('AI coach')}</span></div>
        <div className="hc-sub"><i className="hc-dot" />{isOwn(coach) ? t('Your own model') + ' · ' + (ownCoach(useStore.getState().user?.id, coach)?.model || '') : sub}</div>
      </div>
      {isOwn(coach) && <button className="iconbtn" onClick={editOwn} aria-label={t('Edit your coach')}><Icon name="gear" /></button>}
      <button className="iconbtn" onClick={coachGoalsSheet} aria-label={t('What you train for')} title={t('What you train for')}><Icon name="target" /></button>
      <button className={'iconbtn' + (menu ? ' hc-on' : '')} onClick={() => setMenu(m => !m)} aria-label={t('Conversations')} aria-expanded={menu}><Icon name="list" /></button>
      <button className="iconbtn" onClick={expand} aria-label={t('Full screen')}><Icon name="expand" /></button>
      <button className="iconbtn" onClick={close} aria-label={t('Close')}><Icon name="xmark" /></button>
    </div>
    <Switch coach={coach} ons={ons} pick={pick} own={own} onAdd={addOwn} />
    {menu
      ? <Menu data={data} busy={busy} open={open} start={start} remove={remove} />
      : <div className="hc-list" data-nodrag>
        {!list.length && <div className="hc-hi">
          <Avatar size="xl" coach={coach} />
          <div className="hc-role">{isOwn(coach) ? t('Your own AI coach') : coach === 'athena' ? t('Your strategist: the data, the plan and the why.') : t('Your motivator: training, technique and nutrition.')}</div>
          <div className="hc-m him hc-hello">
            <strong>{t('Hi, I am {0}.', name)}</strong>{' '}
            {t('Ask me anything about training, technique, nutrition or recovery. I know your workouts and your plan.')}
          </div>
          <div className="hc-sugg">
            {suggestions.map(s => <button key={s} className="chip nocap" onClick={() => send(s)}>{s}</button>)}
          </div>
          <GoalsLine />
        </div>}
        {list.map((m, i) => (m.role === 'user'
          ? <div key={i} className="hc-m me">{m.content}</div>
          : <div key={i} className="hc-row">
            {list[i - 1]?.role === 'assistant' ? <span className="hc-av-gap" /> : <Avatar size="sm" badge={false} coach={coach} />}
            <div className="hc-m him"><Reply m={m} onApplied={k => c.markApplied(i, k)} /></div>
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
  const own = useOwnCoaches()
  const pick = id => { setCoach(id); setLastCoach(user?.id, id) }
  // `ask` is a question for the coach it was offered by, and only for the first conversation.
  return <Chat key={coach} close={close} ask={coach === first ? ask : undefined} coach={coach} ons={ons} pick={pick} own={own} />
}

/** Opens the chat on `coach` (the one talked to last by default). */
export const herculesSheet = ({ ask, coach } = {}) => {
  const uid = useStore.getState().user?.id
  const first = COACH_IDS.includes(coach) ? coach : (lastCoach(uid) || 'hercules')
  const ons = Object.fromEntries(COACH_IDS.map(id => [id, statusOf(uid, id)?.on]).filter(([, v]) => v !== undefined && v !== null))
  return useUI.getState().openSheet(close => <CoachSheet close={close} ask={ask} first={first} ons={ons} />)
}

/**
 * The coach in the workout header (Olympus): between sets Hercules or Athena is one tap away, and
 * knows the workout as it stands (lib/coach-profile.js liveWorkoutLines). Hidden for a past
 * workout being logged or edited, and when switched off in the workout's ⋯ menu
 * (S.coachInWorkout). The free daily messages are the same as anywhere else.
 */
export function WorkoutCoachButton() {
  const user = useStore(s => s.user)
  const ready = useStore(s => s.ready)
  const allowed = useStore(s => s.S.coachInWorkout !== false && !!s.S.active && !s.S.active.backfill && !s.S.active.editingWorkoutId)
  const can = socialReady(user) && ready
  const [ons, setOns] = useState(() => Object.fromEntries(COACH_IDS.map(id => [id, !!statusOf(user?.id, id)?.on])))
  useEffect(() => {
    if (!can) return
    let gone = false
    for (const id of COACH_IDS) {
      if (statusOf(user.id, id)) continue
      herculesStatus(id).then(st => { setCached(user.id, id, st); if (!gone) setOns(o => ({ ...o, [id]: !!st.on })) }, () => {})
    }
    return () => { gone = true }
  }, [can, user?.id])
  if (!can || !allowed || !COACH_IDS.some(id => ons[id])) return null
  const last = lastCoach(user?.id)
  const coach = last && (ons[last] || (isOwn(last) && ownCoach(user?.id, last))) ? last : COACH_IDS.find(id => ons[id])
  return <button className="whdr-coach" onClick={() => herculesSheet({ coach })} aria-label={t('Ask {0}, your coach', coachName(coach))} title={coachName(coach)}>
    <Avatar size="sm" coach={coach} />
  </button>
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
  const [hidden, setHidden] = useState(() => fabHidden())
  const [pos, setPos] = useState(() => readFab().pos || null)
  useEffect(() => {
    const sync = () => { setHidden(fabHidden()); setPos(readFab().pos || null) }
    window.addEventListener('olympus:fab', sync)
    return () => window.removeEventListener('olympus:fab', sync)
  }, [])
  const [, relayout] = useState(0)
  useEffect(() => { const r = () => relayout(n => n + 1); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r) }, [])
  const { drag, dragged, handlers: dragHandlers } = useFabDrag({
    onHide: () => { setGreet(null); setFabHidden(true); useUI.getState().toast(t('Coach hidden. Turn it back on in Profile, AI coach.')) },
    onMove: p => { setPos(p); writeFab({ pos: p }) },
  })
  // Read when the bubble is due: the second coach's state may arrive after the first's.
  const onsRef = useRef(ons)
  onsRef.current = ons

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
  const coach = last && (ons[last] || (isOwn(last) && ownCoach(user?.id, last))) ? last : COACH_IDS.find(id => ons[id]) || 'hercules'
  const on = COACH_IDS.some(id => ons[id])
  const here = SHOWN_ON.includes(loc.pathname) && !(loc.pathname === '/workout' && active)
  const visible = on && here && sheets === 0

  // The speech bubble: a moment after the coach first appears, once a day, then gone by itself.
  useEffect(() => {
    if (!visible || greetedFor === user?.id) return
    const show = setTimeout(() => {
      greetedFor = user?.id
      const coaches = COACH_IDS.filter(id => onsRef.current[id])
      const g = takeGreeting(user?.id, useStore.getState().S, undefined, { coaches, names: Object.fromEntries(coaches.map(id => [id, coachName(id)])) })
      if (g) setGreet(g)
    }, GREET_AFTER_MS)
    return () => clearTimeout(show)
  }, [visible, user?.id])
  useEffect(() => {
    if (!greet) return
    const hide = setTimeout(() => setGreet(null), GREET_FOR_MS)
    return () => clearTimeout(hide)
  }, [greet])

  if (!visible || hidden) return null
  const openChat = (ask, c) => { setGreet(null); herculesSheet({ ask, coach: c || coach }) }
  const shown = greet?.coach || coach
  // Where the button is: dragged somewhere, or the corner above the tab bar.
  const place = drag ? { left: drag.x - FAB / 2, top: drag.y - FAB / 2 } : pos ? fabPlace(pos) : null
  const left = place ? place.left + FAB / 2 < window.innerWidth / 2 : false
  const bubbleAt = place ? { bottom: window.innerHeight - place.top + 14, ...(left ? { left: 12, right: 'auto' } : { right: 12, left: 'auto' }) } : null
  return <>
    {greet && !drag && <div className={'hc-bubble' + (left ? ' at-left' : '')} role="status" style={bubbleAt || undefined}>
      <button className="hc-bubble-t" onClick={() => openChat(greet.ask, greet.coach)}>{greet.text}</button>
      <button className="hc-bubble-x" onClick={() => setGreet(null)} aria-label={t('Close')}><Icon name="xmark" /></button>
    </div>}
    {drag && <div className={'hc-drop' + (drag.over ? ' on' : '')} aria-hidden="true"><Icon name="xmark" /></div>}
    <button className={'hc-fab' + (drag ? ' dragging' : '') + (drag?.over ? ' over' : '')} {...dragHandlers} onDragStart={e => e.preventDefault()}
      style={place ? { left: place.left, top: place.top, right: 'auto', bottom: 'auto' } : undefined}
      onClick={() => { if (dragged.current) { dragged.current = false; return } openChat(greet?.ask, greet?.coach) }}
      aria-label={t('Ask {0}, your coach', coachName(shown)) + '. ' + t('Hold and drag to move it, or onto the X to hide it.')}>
      <Avatar size="lg" coach={shown} />
    </button>
  </>
}

const FAB = 62
const EDGE = 12
// The button's spot from what was kept ({ side, fy }: the side it sits on, and how far down the
// screen, as a fraction), so it lands in the same place after a rotation.
function fabPlace(pos) {
  const w = window.innerWidth, h = window.innerHeight
  const top = Math.max(70, Math.min(h - FAB - 90, pos.fy * h))
  return { left: pos.side === 'left' ? EDGE : w - FAB - EDGE, top }
}
// The X to drop the button on, a little above the tab bar in the middle.
const dropCenter = () => ({ x: window.innerWidth / 2, y: window.innerHeight - 140 })
const DROP_R = 56
const HOLD = 280

/** Press, hold (or just move) and drag the button; let go on the X to put it away. */
function useFabDrag({ onHide, onMove }) {
  const [drag, setDrag] = useState(null)
  const dragged = useRef(false)
  const st = useRef(null)
  const begin = (x, y) => { dragged.current = true; try { navigator.vibrate?.(15) } catch { /* no haptics */ } setDrag({ x, y, over: false }) }
  const handlers = {
    onPointerDown: e => {
      dragged.current = false
      st.current = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false }
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* old browsers */ }
      clearTimeout(st.current.tm)
      st.current.tm = setTimeout(() => { if (st.current && !st.current.on) { st.current.on = true; begin(st.current.x, st.current.y) } }, HOLD)
    },
    onPointerMove: e => {
      const s0 = st.current
      if (!s0) return
      if (!s0.on && Math.hypot(e.clientX - s0.x, e.clientY - s0.y) > 6) { s0.on = true; clearTimeout(s0.tm); begin(e.clientX, e.clientY) }
      if (!s0.on) { s0.x = e.clientX; s0.y = e.clientY; return }
      const d = dropCenter()
      setDrag({ x: e.clientX, y: e.clientY, over: Math.hypot(e.clientX - d.x, e.clientY - d.y) < DROP_R })
    },
    onPointerUp: e => {
      const s0 = st.current
      st.current = null
      if (!s0) return
      clearTimeout(s0.tm)
      if (!s0.on) return
      const d = dropCenter()
      const over = Math.hypot(e.clientX - d.x, e.clientY - d.y) < DROP_R
      setDrag(null)
      if (over) onHide()
      else onMove({ side: e.clientX < window.innerWidth / 2 ? 'left' : 'right', fy: (e.clientY - FAB / 2) / window.innerHeight })
    },
  }
  handlers.onPointerCancel = () => { if (st.current) clearTimeout(st.current.tm); st.current = null; setDrag(null) }
  return { drag, dragged, handlers }
}
