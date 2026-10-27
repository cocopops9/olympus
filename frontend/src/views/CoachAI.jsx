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
import { herculesStatus, loadChats, saveChats, dropChat, setLastCoach, lastCoach, COACH_IDS } from '../lib/hercules.js'
import { Avatar, Rich, useCoachChat, coachName, statusOf, setCached, whenOf, fabHidden, setFabHidden, useOwnCoaches, GoalsLine, Reply } from '../components/Hercules.jsx'
import { ownCoachSheet } from '../components/OwnCoach.jsx'
import { isOwn, ownCoach, providerOf } from '../lib/own-coach.js'
import { Switch } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import '../coach-ai.css'
import { MicButton, useCanListen } from '../components/Voice.jsx'
import { speak, stopSpeaking, canSpeak } from '../lib/voice.js'
import { splitActions } from '../lib/coach-actions.js'

const ROLE = {
  hercules: () => t('Your motivator: training, technique and nutrition.'),
  athena: () => t('Your strategist: the data, the plan and the why.'),
}

const hello = name => {
  const h = new Date().getHours()
  return h < 12 ? t('Good morning, {0}', name) : h < 18 ? t('Good afternoon, {0}', name) : t('Good evening, {0}', name)
}

function ModelMenu({ coach, ons, pick, close, own }) {
  const uid = useStore.getState().user?.id
  return <div className="cai-models" role="menu">
    {COACH_IDS.map(id => {
      const st = statusOf(uid, id)
      return <button key={id} role="menuitem" className={'cai-model' + (id === coach ? ' on' : '')} disabled={!ons[id]}
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
  const lists = useMemo(() => [...COACH_IDS, ...own.map(c => c.id)].map(id => [id, loadChats(uid, id).chats]), [uid, version, open, own])
  const remove = (id, chatId) => {
    saveChats(uid, dropChat(loadChats(uid, id), chatId), id)
    // The conversation on screen is gone: a new one takes its place.
    if (id === coach && chatId === current) onNew()
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
          <div className="cai-dgh"><Avatar size="xs" badge={false} coach={id} />{coachName(id)}</div>
          {list.map(c => <div key={c.id} className={'cai-ditem' + (id === coach && c.id === current ? ' on' : '')}>
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

function Conversation({ coach, chatId, onChange, voice = false }) {
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
  useEffect(() => {
    const grew = list.length > seen.current
    seen.current = list.length
    const lastMsg = list[list.length - 1]
    if (!voice || !grew || lastMsg?.role !== 'assistant') return
    let gone = false
    setSpeaking(true)
    speak(splitActions(lastMsg.content).text).finally(() => { if (gone) return; setSpeaking(false); mic.current?.start() })
    return () => { gone = true; stopSpeaking(); setSpeaking(false) }
  }, [list.length, voice])
  useEffect(() => { if (!voice) { stopSpeaking(); mic.current?.stop() } }, [voice])
  const first = String(user?.name || '').split(/\s+/)[0]
  return <>
    <main className="cai-main">
      <div className="cai-col">
        {!list.length && <div className="cai-hi">
          <Avatar size="xl" coach={coach} />
          <h2>{first ? hello(first) : t('Hi, I am {0}.', name)}</h2>
          <p className="muted">{ROLE[coach] ? ROLE[coach]() : t('Your own AI coach')}</p>
          <div className="cai-sugg">
            {suggestions.map(s => <button key={s} className="cai-card" onClick={() => send(s)}><Icon name="sparkles" /><span>{s}</span></button>)}
          </div>
          <div style={{ width: '100%', maxWidth: 560 }}><GoalsLine /></div>
        </div>}
        {list.map((m, i) => (m.role === 'user'
          ? <div key={i} className="cai-me">{m.content}</div>
          : <div key={i} className="cai-him">
            {list[i - 1]?.role !== 'assistant' && <div className="cai-who"><Avatar size="sm" badge={false} coach={coach} />{name}</div>}
            <div className="cai-text"><Reply m={m} onApplied={k => markApplied(i, k)} /></div>
          </div>))}
        {busy && <div className="cai-him"><div className="cai-who"><Avatar size="sm" badge={false} live coach={coach} />{name}</div>
          <div className="hc-typing" aria-label={t('{0} is writing…', name)}><i /><i /><i /></div></div>}
        {err && <div className="hc-err" role="alert">{err}</div>}
        <div ref={end} />
      </div>
    </main>
    <form className="cai-in" onSubmit={e => { e.preventDefault(); send() }}>
      {voice && <div className="voice-banner" role="status"><i />{speaking ? t('{0} is speaking. Tap the microphone to answer.', name) : t('Voice mode: tap the microphone and talk.')}</div>}
      <div className="cai-box">
        <textarea ref={input} rows={1} maxLength={2000} value={draft} placeholder={t('Ask {0}…', name)}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        <MicButton control={mic} disabled={busy} onText={setDraft} onFinal={text => { if (voice) send(text); else setDraft(text) }} />
        <button type="submit" className="hc-send" disabled={busy || !draft.trim()} aria-label={t('Send')}><Icon name="arrowUp" /></button>
      </div>
      <div className="cai-note">{left != null && tn('{0} message left today', '{0} messages left today', left) + ' · '}{t('{0} is an AI and can be wrong. For pain or health problems, see a doctor.', name)}</div>
    </form>
  </>
}

export default function CoachAI() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const user = useStore(s => s.user)
  const ready = socialReady(user)
  const asked = params.get('c')
  const [coach, setCoach] = useState(() => (COACH_IDS.includes(asked) || (isOwn(asked) && ownCoach(user?.id, asked)) ? asked : lastCoach(user?.id) || 'hercules'))
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
  const pick = id => { setCoach(id); setChat(null); setLastCoach(user?.id, id); setParams({ c: id }, { replace: true }) }
  const openChat = (id, chatId) => { setCoach(id); setChat(chatId); setLastCoach(user?.id, id); setDrawer(false); setParams({ c: id, chat: chatId }, { replace: true }); bump() }
  const newChat = () => { setChat('new'); setDrawer(false); setParams({ c: coach }, { replace: true }); bump() }
  const leave = () => (window.history.length > 1 ? nav(-1) : nav('/profile'))

  if (!ready) return <div className="cai cai-off"><div className="cai-col"><p className="muted">{t('{0} is not available on this server.', t('AI coach'))}</p></div></div>
  return <div className="cai">
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
        <button className="iconbtn" onClick={newChat} aria-label={t('New conversation')}><Icon name="pencil" /></button>
        <button className="iconbtn" onClick={leave} aria-label={t('Close')}><Icon name="xmark" /></button>
        {models && <ModelMenu coach={coach} ons={ons} pick={pick} close={() => setModels(false)} own={own} />}
      </header>
      <Conversation key={coach} coach={coach} chatId={chat} voice={voice && canVoice}
        onChange={id => { if (id && id !== chat) { setChat(id); setParams({ c: coach, chat: id }, { replace: true }) } bump() }} />
    </div>
  </div>
}

