// Olympus: the AI coaches full screen, laid out like a chat assistant: the conversations in a
// drawer on the left (always open on a wide screen), the coach to talk to picked at the top like a
// model, the conversation in the middle and the box to write in at the bottom. Reached from
// Profile (AI coach) and from the chat sheet's full-screen button; ?c=athena&chat=<id> opens a
// given coach and conversation. The chat sheet stays the quick way in.
import { track } from '../lib/telemetry.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, tn } from '../lib/i18n.js'
import { socialReady } from '../lib/social.js'
import { herculesStatus, loadChats, saveChats, dropChat, setLastCoach, lastCoach, COACH_IDS, BOTH, chatBucket, TEAM } from '../lib/hercules.js'
import { Avatar, Rich, useCoachChat, coachName, statusOf, setCached, whenOf, fabHidden, setFabHidden, useOwnCoaches, GoalsLine, Reply } from '../components/Hercules.jsx'
import { ownCoachSheet } from '../components/OwnCoach.jsx'
import { coachGoalsSheet } from '../components/CoachGoals.jsx'
import { isOwn, ownCoach, providerOf } from '../lib/own-coach.js'
import { Switch } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import '../coach-ai.css'
import { MicButton, useCanListen } from '../components/Voice.jsx'
import { speak, stopSpeaking, canSpeak, warmVoice } from '../lib/voice.js'
import { useUI } from '../store/useUI.js'
import { splitActions } from '../lib/coach-actions.js'

const ROLE = {
  hercules: () => t('Your motivator: training, technique and nutrition.'),
  athena: () => t('Your strategist: the data, the plan and the why.'),
  both: () => t('Both answer each message: Hercules first, then Athena builds on it.'),
}

const hello = name => {
  const h = new Date().getHours()
  return h < 12 ? t('Good morning, {0}', name) : h < 18 ? t('Good afternoon, {0}', name) : t('Good evening, {0}', name)
}

function ModelMenu({ coach, ons, pick, close, own }) {
  const uid = useStore.getState().user?.id
  return <div className="cai-models" role="menu">
    {COACH_IDS.map(id => {
      const st = id === BOTH ? null : statusOf(uid, id)
      const on = id === BOTH ? COACH_IDS.every(x => ons[x]) : ons[id]
      return <button key={id} role="menuitem" className={'cai-model' + (id === coach ? ' on' : '')} disabled={!on}
        onClick={() => { close(); pick(id) }}>
        <Avatar size="md" coach={id} />
        <span className="grow">
          <b>{coachName(id)}</b>
          <span className="small muted">{ROLE[id]()}</span>
          {st && st.left != null && <span className="small muted">{tn('{0} message left today', '{0} messages left today', st.left)}</span>}
        </span>
        {id === coach && <Icon name="check" />}
      </button>
    })}
    {own.map(c => <button key={c.id} role="menuitem" className={'cai-model' + (c.id === coach ? ' on' : '')} onClick={() => { close(); pick(c.id) }}>
      <Avatar size="md" coach={c.id} />
      <span className="grow">
        <b>{c.name}</b>
        <span className="small muted">{providerOf(c.provider).name} · {c.model}</span>
      </span>
      {c.id === coach && <Icon name="check" />}
    </button>)}
    <button role="menuitem" className="cai-model cai-add" onClick={() => { close(); ownCoachSheet(null, saved => saved && pick(saved.id)) }}>
      <span className="cai-add-i"><Icon name="plus" /></span>
      <span className="grow"><b>{t('Add your own AI coach')}</b><span className="small muted">{t('Your model and API key: OpenAI, Claude, Gemini, Groq, a model on your computer…')}</span></span>
    </button>
  </div>
}

function Drawer({ coach, current, open, onOpen, onNew, onClose, version, bump, own }) {
  const uid = useStore(s => s.user?.id)
  const [hidden, setHidden] = useState(() => fabHidden())
  // Both coaches' conversations, read again whenever one changes (`version`).
  // Hercules and Athena share one list (lib/hercules.js TEAM); each coach of your own has its own.
  const lists = useMemo(() => [TEAM, ...own.map(c => c.id)].map(id => [id, loadChats(uid, id).chats]), [uid, version, open, own])
  const remove = (id, chatId) => {
    saveChats(uid, dropChat(loadChats(uid, id), chatId), id)
    // The conversation on screen is gone: a new one takes its place.
    if (id === chatBucket(coach) && chatId === current) onNew()
    bump()
  }
  return <>
    <div className={'cai-scrim' + (open ? ' on' : '')} onClick={onClose} />
    <aside className={'cai-drawer' + (open ? ' on' : '')} aria-label={t('Conversations')}>
      <div className="cai-dh">
        <span className="cai-brand"><Avatar size="xs" badge={false} coach="hercules" /><Avatar size="xs" badge={false} coach="athena" />{t('AI coach')}</span>
        <button className="iconbtn cai-only-narrow" onClick={onClose} aria-label={t('Close')}><Icon name="xmark" /></button>
      </div>
      <button className="cai-new" onClick={onNew}><Icon name="plusCircle" /><span>{t('New conversation')}</span></button>
      <div className="cai-dl">
        {lists.every(([, l]) => !l.length) && <div className="cai-dempty small muted">{t('No conversations yet.')}</div>}
        {lists.map(([id, list]) => list.length > 0 && <div key={id} className="cai-dgroup">
          <div className="cai-dgh"><Avatar size="xs" badge={false} coach={id === TEAM ? BOTH : id} />{coachName(id === TEAM ? BOTH : id)}</div>
          {list.map(c => <div key={c.id} className={'cai-ditem' + (id === chatBucket(coach) && c.id === current ? ' on' : '')}>
            <button className="cai-dopen" onClick={() => onOpen(id, c.id)}>
              <span className="cai-dt">{c.title || t('New conversation')}</span>
              <span className="cai-dd">{whenOf(c.ts)}</span>
            </button>
            <button className="iconbtn" onClick={() => remove(id, c.id)} aria-label={t('Delete conversation')}><Icon name="trash" /></button>
          </div>)}
        </div>)}
      </div>
      <div className="cai-dfoot">
        <span className="grow small">{t('Floating coach on the screens')}</span>
        <Switch checked={!hidden} onChange={on => { setHidden(!on); setFabHidden(!on) }} aria-label={t('Floating coach on the screens')} />
      </div>
    </aside>
  </>
}

function Conversation({ coach, chatId, onChange, voice = false, onVoiceOff }) {
  const user = useStore(s => s.user)
  const c = useCoachChat({ coach, chatId, onSent: onChange })
  const { name, list, draft, setDraft, busy, err, left, input, send, suggestions, data, markApplied } = c
  const end = useRef(null)
  // A conversation picked in the drawer, or a new one asked for there.
  useEffect(() => { if (chatId === 'new') c.start(); else if (chatId && chatId !== data.current) c.open(chatId) }, [chatId])
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }) }, [list.length, busy, err])
  useEffect(() => { if (!busy) onChange?.(data.current) }, [busy, data.current])
  // Voice mode: a new answer is read aloud, then the microphone listens for the next question,
  // which goes by itself when you stop talking (lib/voice.js).
  const mic = useRef(null)
  const seen = useRef(list.length)
  const [speaking, setSpeaking] = useState(false)
  // With both coaches answering, each answer is read as it comes, and the microphone opens once
  // the last one has been read.
  useEffect(() => {
    const grew = list.length > seen.current
    seen.current = list.length
    const lastMsg = list[list.length - 1]
    if (!voice || !grew || lastMsg?.role !== 'assistant') return
    let gone = false
    setSpeaking(true)
    speak(splitActions(lastMsg.content).text, { who: c.authorOf(lastMsg) }).finally(() => { if (gone) return; setSpeaking(false); if (!busyRef.current) { silences.current = 0; mic.current?.start() } })
    return () => { gone = true; stopSpeaking(); setSpeaking(false) }
  }, [list.length, voice])
  const busyRef = useRef(busy)
  busyRef.current = busy
  // Voice mode is hands free: it listens as soon as it is on, and after every answer read; the
  // microphone button ends it. Two silences in a row end it too.
  const silences = useRef(0)
  useEffect(() => {
    if (!voice) { stopSpeaking(); mic.current?.stop({ cancel: true }); return }
    warmVoice()
    silences.current = 0
    const tm = setTimeout(() => { if (!busyRef.current) mic.current?.start() }, 300)
    return () => clearTimeout(tm)
  }, [voice])
  const heardNothing = () => {
    if (!voice) return
    if (++silences.current >= 2) { onVoiceOff?.(); useUI.getState().toast(t('Voice mode is off: I did not hear anything.')); return }
    mic.current?.start()
  }
  const first = String(user?.name || '').split(/\s+/)[0]
  return <>
    <main className="cai-main">
      <div className="cai-col">
        {!list.length && <div className="cai-hi">
          <Avatar size="xl" coach={coach} />
          <h2>{first ? hello(first) : coach === BOTH ? t('Hi, we are Hercules and Athena.') : t('Hi, I am {0}.', name)}</h2>
          <p className="muted">{ROLE[coach] ? ROLE[coach]() : t('Your own AI coach')}</p>
          <div className="cai-sugg">
            {suggestions.map(s => <button key={s} className="cai-card" onClick={() => send(s)}><Icon name="sparkles" /><span>{s}</span></button>)}
          </div>
          <div style={{ width: '100%', maxWidth: 560 }}><GoalsLine /></div>
        </div>}
        {list.map((m, i) => {
          if (m.role === 'user') return <div key={i} className="cai-me">{m.content}</div>
          const by = c.authorOf(m)
          const prev = list[i - 1]
          return <div key={i} className="cai-him">
            {!(prev?.role === 'assistant' && c.authorOf(prev) === by) && <div className="cai-who"><Avatar size="sm" badge={false} coach={by} />{coachName(by)}</div>}
            <div className="cai-text"><Reply m={m} onApplied={k => markApplied(i, k)} /></div>
          </div>
        })}
        {busy && <div className="cai-him"><div className="cai-who"><Avatar size="sm" badge={false} live coach={c.writing} />{coachName(c.writing)}</div>
          <div className="hc-typing" aria-label={t('{0} is writing…', coachName(c.writing))}><i /><i /><i /></div></div>}
        {err && <div className="hc-err" role="alert">{err}</div>}
        <div ref={end} />
      </div>
    </main>
    <form className="cai-in" onSubmit={e => { e.preventDefault(); send() }}>
      {voice && <div className="voice-banner" role="status"><i />{speaking ? t('{0} is speaking. Tap the microphone to stop voice mode.', name) : busy ? t('{0} is thinking…', name) : t('Voice mode: talk, I am listening. Tap the microphone to stop.')}</div>}
      <div className="cai-box">
        <textarea ref={input} rows={1} maxLength={2000} value={draft} placeholder={t('Ask {0}…', name)}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        <MicButton control={mic} disabled={busy} onText={setDraft} onFinal={text => { if (voice) { silences.current = 0; send(text) } else setDraft(text) }}
          onSilence={heardNothing} onStopVoice={voice ? () => { stopSpeaking(); onVoiceOff?.() } : undefined} />
        <button type="submit" className="hc-send" disabled={busy || !draft.trim()} aria-label={t('Send')}><Icon name="arrowUp" /></button>
      </div>
      <div className="cai-note">{left != null && tn('{0} message left today', '{0} messages left today', left) + ' · '}{t('{0} is an AI and can be wrong. For pain or health problems, see a doctor.', name)}</div>
    </form>
  </>
}

// Dragging down with a finger minimises the screen, like a sheet: from the top bar, or from the
// conversation while it is scrolled to its top. The screen follows the finger; let go past a
// third of the way (or with a quick flick) and it leaves, otherwise it springs back. Horizontal
// moves, the text box, the conversations drawer and the coach menu are left alone.
const PULL_ENGAGE = 12
const PULL_LEAVE = 120
function useSwipeDownToClose(ref, onLeave) {
  const leaveRef = useRef(onLeave)
  leaveRef.current = onLeave
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let g = null   // { x, y, t, pull, on }
    const startsHere = target => {
      if (!target?.closest || !target.closest('.cai-body')) return false
      if (target.closest('textarea, input, .cai-models, .cai-in')) return false
      if (target.closest('.cai-top')) return true
      const main = target.closest('.cai-main')
      return !!main && main.scrollTop <= 0
    }
    const start = e => {
      g = e.touches.length === 1 && startsHere(e.target) ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), pull: 0, on: false } : null
    }
    const move = e => {
      if (!g) return
      const dx = e.touches[0].clientX - g.x, dy = e.touches[0].clientY - g.y
      if (!g.on) {
        if (Math.abs(dx) > PULL_ENGAGE && Math.abs(dx) > Math.abs(dy)) { g = null; return }
        if (dy < -PULL_ENGAGE) { g = null; return }
        if (dy < PULL_ENGAGE || dy < Math.abs(dx) * 1.5) return
        g.on = true
        el.style.transition = 'none'
      }
      g.pull = Math.max(0, dy - PULL_ENGAGE)
      if (e.cancelable) e.preventDefault()
      el.style.transform = 'translateY(' + g.pull + 'px)'
      el.style.opacity = String(Math.max(0.5, 1 - g.pull / 600))
    }
    const end = () => {
      if (!g || !g.on) { g = null; return }
      const { pull, t } = g
      g = null
      const fast = pull > 40 && pull / Math.max(1, Date.now() - t) > 0.5
      el.style.transition = 'transform .2s ease-out, opacity .2s ease-out'
      if (pull > PULL_LEAVE || fast) {
        el.style.transform = 'translateY(100%)'
        el.style.opacity = '0'
        setTimeout(() => leaveRef.current(), 200)
      } else {
        el.style.transform = ''
        el.style.opacity = ''
      }
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [ref])
}

export default function CoachAI() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const user = useStore(s => s.user)
  const ready = socialReady(user)
  const asked = params.get('c')
  const [coach, setCoach] = useState(() => (COACH_IDS.includes(asked) || asked === BOTH || (isOwn(asked) && ownCoach(user?.id, asked)) ? asked : lastCoach(user?.id) || 'hercules'))
  const [chat, setChat] = useState(() => params.get('chat') || null)
  const [drawer, setDrawer] = useState(false)
  const [models, setModels] = useState(false)
  const [version, setVersion] = useState(0)
  const [ons, setOns] = useState(() => Object.fromEntries(COACH_IDS.map(id => [id, statusOf(user?.id, id)?.on !== false])))
  const bump = () => setVersion(v => v + 1)
  // Voice mode needs dictation and a voice to read with (lib/voice.js).
  const canDictate = useCanListen()
  const canVoice = !!canDictate && canSpeak()
  const [voice, setVoice] = useState(() => { try { return localStorage.getItem('olympus_voice_mode') === '1' } catch { return false } })

  useEffect(() => {
    if (!ready) return
    let gone = false
    for (const id of COACH_IDS) herculesStatus(id).then(s => { setCached(user.id, id, s); if (!gone) setOns(o => ({ ...o, [id]: !!s.on })) }, () => {})
    return () => { gone = true }
  }, [ready, user?.id])
  useEffect(() => { if (!models) return; const off = e => { if (!e.target.closest?.('.cai-models, .cai-pick')) setModels(false) }; document.addEventListener('pointerdown', off); return () => document.removeEventListener('pointerdown', off) }, [models])

  const own = useOwnCoaches()
  const pick = id => {
    const keep = chatBucket(id) === chatBucket(coach)
    setCoach(id); if (!keep) setChat(null); setLastCoach(user?.id, id)
    setParams(keep && chat ? { c: id, chat } : { c: id }, { replace: true })
  }
  // A conversation of the shared list opens with whoever answers there now.
  const openChat = (id, chatId) => {
    const last = lastCoach(user?.id)
    const next = id === TEAM ? (chatBucket(coach) === TEAM ? coach : chatBucket(last) === TEAM ? last : 'hercules') : id
    setCoach(next); setChat(chatId); setLastCoach(user?.id, next); setDrawer(false); setParams({ c: next, chat: chatId }, { replace: true }); bump()
  }
  const newChat = () => { setChat('new'); setDrawer(false); setParams({ c: coach }, { replace: true }); bump() }
  const leave = () => (window.history.length > 1 ? nav(-1) : nav('/profile'))
  const root = useRef(null)
  useSwipeDownToClose(root, leave)

  if (!ready) return <div className="cai cai-off"><div className="cai-col"><p className="muted">{t('{0} is not available on this server.', t('AI coach'))}</p></div></div>
  return <div className="cai" ref={root}>
    <Drawer coach={coach} current={chat} open={drawer} onOpen={openChat} onNew={newChat} onClose={() => setDrawer(false)} version={version} bump={bump} own={own} />
    <div className="cai-body">
      <header className="cai-top">
        <button className="iconbtn cai-only-narrow" onClick={() => setDrawer(true)} aria-label={t('Conversations')}><Icon name="list" /></button>
        <button className="cai-pick" onClick={() => setModels(m => !m)} aria-expanded={models}>
          <Avatar size="xs" badge={false} coach={coach} /><b>{coachName(coach)}</b><Icon name="chevronDown" />
        </button>
        <span className="grow" />
        {isOwn(coach) && <button className="iconbtn" onClick={() => ownCoachSheet(ownCoach(user?.id, coach), saved => pick(saved ? saved.id : 'hercules'))} aria-label={t('Edit your coach')}><Icon name="gear" /></button>}
        {canVoice && <button className={'iconbtn' + (voice ? ' voice-on' : '')} onClick={() => setVoice(v => { const n = !v; if (n) track('coach.voice'); try { localStorage.setItem('olympus_voice_mode', n ? '1' : '0') } catch { /* a convenience */ } return n })}
          aria-pressed={voice} aria-label={t('Voice mode')} title={t('Voice mode')}><Icon name="speaker" /></button>}
        {/* The memory the coaches share (lib/coach-memory.js), one tap away. A new conversation is
            the drawer's first button, so the pencil that did the same thing is gone. */}
        <button className="iconbtn" onClick={() => coachGoalsSheet({ focus: 'memory' })} aria-label={t('Your memory')} title={t('Your memory')}><Icon name="brain" /></button>
        <button className="iconbtn" onClick={leave} aria-label={t('Close')}><Icon name="xmark" /></button>
        {models && <ModelMenu coach={coach} ons={ons} pick={pick} close={() => setModels(false)} own={own} />}
      </header>
      <Conversation key={chatBucket(coach)} coach={coach} chatId={chat} voice={voice && canVoice}
        onVoiceOff={() => { setVoice(false); try { localStorage.setItem('olympus_voice_mode', '0') } catch { /* a convenience */ } }}
        onChange={id => { if (id && id !== chat) { setChat(id); setParams({ c: coach, chat: id }, { replace: true }) } bump() }} />
    </div>
  </div>
}

