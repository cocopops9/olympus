// Olympus: the app guide, Settings → App guide (lib/app-guide.js has the topics and what it keeps).
//   <AppGuide>        the page: how much is read, a search, and a card per topic
//   openTopic(id)     a topic in a sheet, one step at a time: a picture or a small demo to try,
//                     Calliope reading it aloud on a tap, and at the end "Show me", which opens
//                     the real screen and has her point at its buttons there
// Nothing here changes the person's data: the demos keep their own state and are thrown away.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, dateLocale } from '../lib/i18n.js'
import { TOPICS, guideProgress, nextTopic, searchTopics, topicById, topicRead, withGuideUnread, withTopicRead } from '../lib/app-guide.js'
import { tourFor } from '../lib/calliope.js'
import { withTourSeen } from '../lib/guide.js'
import { Button, Row, SearchField, Section, Segmented } from './ui.jsx'
import Icon from './Icon.jsx'
import { CalliopeFace, calliopeSheet, startScreenTour, useCalliopeVoice } from './Calliope.jsx'
import hercules from '../assets/hercules.webp'
import athena from '../assets/athena.webp'
import chiron from '../assets/chiron-asleep.webp'
import '../guide.css'

/** The page. */
export default function AppGuide() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [q, setQ] = useState('')
  const { done, total } = guideProgress(S)
  const next = nextTopic(S)
  const shown = searchTopics(q)
  return <div className="ag">
    <div className="card ag-hero">
      <CalliopeFace size={54} />
      <div className="ag-hero-m">
        <b>{done === total ? t('You know every part of Olympus!') : done ? t('Welcome back!') : t('Learn Olympus in a few minutes')}</b>
        <span className="small muted">{t('Pick a topic: a few short steps, things to try, and the real screen at the end.')}</span>
        <div className="ag-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}
          aria-label={t('{0} of {1} topics explored', done, total)}><i style={{ width: (100 * done / total) + '%' }} /></div>
        <span className="small dim">{t('{0} of {1} topics explored', done, total)}</span>
      </div>
    </div>
    {next && <Button variant="primary" className="ag-next" icon="play" onClick={() => openTopic(next.id)}>
      {done ? t('Continue: {0}', next.title()) : t('Start with: {0}', next.title())}
    </Button>}
    <div className="ag-search">
      <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')}
        placeholder={t('What do you want to do?')} aria-label={t('Search the guide')} inputMode="search" enterKeyHint="search" autoComplete="off" />
    </div>
    {shown.length ? <div className="ag-grid">
      {shown.map(x => {
        const read = topicRead(S, x.id)
        return <button key={x.id} type="button" className={'ag-topic' + (read ? ' read' : '')} data-topic={x.id} onClick={() => openTopic(x.id)}>
          <span className="ag-topic-i" style={{ '--c': x.tint }}><Icon name={x.icon} /></span>
          <b>{x.title()}</b>
          <span className="small muted">{x.summary()}</span>
          {read && <span className="ag-topic-ok" aria-label={t('Explored')}><Icon name="check" /></span>}
        </button>
      })}
    </div> : <div className="sp-empty">{t('Nothing in the guide matches “{0}”. Ask Calliope instead.', q.trim())}</div>}
    <Section footer={t('Calliope answers any question about the app, in words or aloud.')}>
      <Row icon="chat" iconTint="var(--acc)" title={t('Ask Calliope')} subtitle={q.trim() ? q.trim() : t('Your guide: how anything in the app works')}
        accessory="chevron" onClick={() => calliopeSheet(q.trim())} />
      {done > 0 && <Row icon="reset" iconTint="var(--grey)" title={t('Mark every topic as new')}
        onClick={() => update(s => { s.hints = withGuideUnread(s.hints) })} />}
    </Section>
  </div>
}

/** Topic `id` in a sheet, from its first step. */
export function openTopic(id) {
  if (!topicById(id)) return
  useUI.getState().openSheet(close => <TopicSheet id={id} close={close} />)
}

// "Show me": the real screen, and Calliope's tour of it once its first button is on screen (a
// screen opens a moment after the route changes; a few seconds at most, then she stays quiet).
function showMe(topic) {
  window.location.hash = '#' + topic.route
  if (!topic.tour) return
  let tries = 0
  const go = () => {
    const steps = tourFor(topic.tour)
    const first = steps[0]?.target
    if (steps.length && (!first || document.querySelector(first))) {
      useStore.getState().update(s => { s.hints = withTourSeen(s.hints, topic.tour) })
      startScreenTour(topic.tour, steps)
    } else if (++tries < 12) setTimeout(go, 400)
  }
  setTimeout(go, 600)
}

function TopicSheet({ id, close }) {
  const update = useStore(s => s.update)
  const [topicId, setTopicId] = useState(id)
  const topic = topicById(topicId)
  const steps = topic.steps()
  const [at, setAt] = useState(0)
  const voice = useCalliopeVoice()
  const step = steps[at]
  const last = at === steps.length - 1
  // Read once the last step is reached: that is the whole topic seen, whatever is tapped then.
  useEffect(() => { if (last) update(s => { s.hints = withTopicRead(s.hints, topicId) }) }, [last, topicId, update])
  useEffect(() => () => voice.hush(), [voice.hush])
  const goTo = i => { voice.hush(); setAt(Math.max(0, Math.min(steps.length - 1, i))) }
  // A swipe sideways turns the page, as on the welcome.
  const swipe = useRef(null)
  const onDown = e => { swipe.current = { x: e.clientX, y: e.clientY } }
  const onUp = e => {
    const s = swipe.current
    swipe.current = null
    if (!s) return
    const dx = e.clientX - s.x
    if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(e.clientY - s.y)) goTo(at + (dx < 0 ? 1 : -1) * (document.dir === 'rtl' ? -1 : 1))
  }
  const following = TOPICS[TOPICS.findIndex(x => x.id === topicId) + 1] || null
  const listen = () => { if (voice.talking) voice.hush(); else voice.say(step.text, { keep: true, force: true }) }
  return <div className="ag-sheet">
    <div className="ag-sheet-h">
      <span className="ag-topic-i" style={{ '--c': topic.tint }}><Icon name={topic.icon} /></span>
      <div className="ag-sheet-t"><h3>{topic.title()}</h3><span className="small dim">{t('Step {0} of {1}', at + 1, steps.length)}</span></div>
      <button type="button" className={'guide-tip-say' + (voice.talking ? ' on' : '')} onClick={listen}
        aria-label={voice.talking ? t('Stop') : t('Listen')} title={voice.talking ? t('Stop') : t('Listen')}><Icon name="speaker" /></button>
    </div>
    <div className="guide-dots" aria-hidden="true">{steps.map((_, i) => <i key={i} className={i === at ? 'on' : ''} onClick={() => goTo(i)} />)}</div>
    <div className="ag-step" key={topicId + ':' + at} onPointerDown={onDown} onPointerUp={onUp}>
      <div className="ag-stage">{step.demo ? <Demo kind={step.demo} /> : <Art kind={step.art} tint={topic.tint} />}</div>
      <p className="ag-text">{step.text}</p>
    </div>
    {last && <div className="ag-end">
      {topic.route && <Button variant="primary" icon="play" onClick={() => { close(); showMe(topic) }}>{t('Show me in the app')}</Button>}
      {topic.ask() && <Button variant="tinted" icon="chat" onClick={() => { close(); calliopeSheet(topic.ask()) }}>{t('Ask Calliope about this')}</Button>}
      {following && <Button variant="ghost" trailingIcon="chevronRight" onClick={() => { voice.hush(); setTopicId(following.id); setAt(0) }}>{t('Next topic: {0}', following.title())}</Button>}
    </div>}
    <div className="guide-welcome-a">
      {at > 0 ? <Button variant="ghost" icon="chevronLeft" onClick={() => goTo(at - 1)}>{t('Back')}</Button> : <span />}
      {last ? <Button variant="tinted" onClick={close}>{t('Done')}</Button>
        : <Button variant="tinted" trailingIcon="chevronRight" onClick={() => goTo(at + 1)}>{t('Next')}</Button>}
    </div>
  </div>
}

/* ---------------- the pictures ---------------- */

function Art({ kind, tint }) {
  if (kind === 'coaches') return <div className="ag-art ag-faces"><img src={hercules} alt="Hercules" /><img src={athena} alt="Athena" /></div>
  if (kind === 'chiron') return <div className="ag-art ag-faces"><img src={chiron} alt={t('Chiron')} /></div>
  if (kind === 'calliope') return <div className="ag-art"><CalliopeFace size={96} /></div>
  return <div className="ag-art"><span className="ag-art-i" style={{ '--c': tint }}><Icon name={kind || 'info'} /></span></div>
}

/* ---------------- the demos: the real gesture, on a copy that changes nothing ---------------- */

function Demo({ kind }) {
  const D = DEMOS[kind]
  return D ? <D /> : null
}

function TabBarDemo() {
  const [on, setOn] = useState(null)
  const tabs = [
    { id: 'home', icon: 'house', label: t('Home'), say: t('Your feed: your friends’ workouts next to yours.') },
    { id: 'workout', icon: 'play', label: t('Workout'), say: t('Starts a workout, or takes you back to the one running.') },
    { id: 'profile', icon: 'personCircle', label: t('Profile'), say: t('Your week, charts, plan, exercises and settings.') },
  ]
  const cur = tabs.find(x => x.id === on)
  return <div className="ag-demo">
    <div className="ag-say small" aria-live="polite">{cur ? cur.say : t('Tap a button.')}</div>
    <div className="ag-tabbar">
      {tabs.map(x => <button key={x.id} type="button" className={(x.id === 'workout' ? 'start' : '') + (on === x.id ? ' on' : '')}
        onClick={() => setOn(x.id)} aria-pressed={on === x.id}>
        <Icon name={x.icon} /><span>{x.label}</span>
      </button>)}
    </div>
  </div>
}

const REST = 90
const fmtClock = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')

function SetRowDemo() {
  const [kg, setKg] = useState(60)
  const [reps, setReps] = useState(8)
  const [done, setDone] = useState(false)
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (!done) { setLeft(0); return }
    setLeft(REST)
    const tm = setInterval(() => setLeft(v => (v > 0 ? v - 1 : 0)), 1000)
    return () => clearInterval(tm)
  }, [done])
  return <div className="ag-demo">
    <div className="ag-set-h small dim"><span>#</span><span>{t('Weight ({0})', 'kg')}</span><span>{t('Reps')}</span><span /></div>
    <div className={'ag-set' + (done ? ' done' : '')}>
      <span className="ag-set-n">1</span>
      <Spin value={kg} step={2.5} onChange={setKg} label={t('Weight ({0})', 'kg')} />
      <Spin value={reps} step={1} onChange={setReps} label={t('Reps')} />
      <button type="button" className="ag-tick" aria-pressed={done} aria-label={done ? t('Done') : t('Tick the set')} onClick={() => setDone(v => !v)}><Icon name="check" /></button>
    </div>
    <div className="ag-say small" aria-live="polite">
      {done ? <><Icon name="timer" /> {t('Rest')} {fmtClock(left)}</> : t('Change the numbers, then tap the tick.')}
    </div>
  </div>
}

function Spin({ value, step, onChange, label }) {
  const fmt = v => String(Math.round(v * 10) / 10)
  return <span className="ag-spin" role="group" aria-label={label}>
    <button type="button" aria-label={t('Less')} onClick={() => onChange(Math.max(0, value - step))}><Icon name="minus" /></button>
    <b>{fmt(value)}</b>
    <button type="button" aria-label={t('More')} onClick={() => onChange(value + step)}><Icon name="plus" /></button>
  </span>
}

function SetKindDemo() {
  const [menu, setMenu] = useState(false)
  const [kind, setKind] = useState(null)
  const kinds = [
    { id: 'warm', icon: 'sunrise', label: t('Make it a warm-up set'), tag: t('Warm-up') },
    { id: 'fail', icon: 'gauge', label: t('Taken to failure'), tag: t('Taken to failure') },
    { id: 'drop', icon: 'arrowDown', label: t('Drop set'), tag: t('Drop set') },
  ]
  const cur = kinds.find(k => k.id === kind)
  return <div className="ag-demo">
    <div className="ag-set">
      <button type="button" className={'ag-set-n tap' + (menu ? '' : ' ag-pulse')} aria-expanded={menu} onClick={() => setMenu(v => !v)}>{kind === 'warm' ? '🔥' : '1'}</button>
      <span className="ag-set-v">60 kg</span><span className="ag-set-v">× 8</span>
      {cur && <span className="ag-tag">{cur.tag}</span>}
    </div>
    {menu ? <div className="ag-menu" role="menu">
      {kinds.map(k => <button key={k.id} type="button" role="menuitemradio" aria-checked={kind === k.id}
        onClick={() => { setKind(kind === k.id ? null : k.id); setMenu(false) }}>
        <Icon name={k.icon} /><span>{k.label}</span>{kind === k.id && <Icon name="check" />}
      </button>)}
    </div> : <div className="ag-say small">{cur ? t('Tap the number again to change it back.') : t('Tap the number 1.')}</div>}
  </div>
}

function UnitDemo() {
  const [lb, setLb] = useState(false)
  const w = lb ? '132.5' : '60'
  return <div className="ag-demo">
    <div className="ag-set-h small"><span /><button type="button" className="ag-unit ag-pulse" onClick={() => setLb(v => !v)}>{t('Weight ({0})', lb ? 'lb' : 'kg')}</button><span>{t('Reps')}</span></div>
    <div className="ag-set"><span className="ag-set-n">1</span><span className="ag-set-v">{w}</span><span className="ag-set-v">8</span></div>
    <div className="ag-say small" aria-live="polite">{t('Tap the Weight title to switch between kg and lb.')}</div>
  </div>
}

function ScheduleDemo() {
  const [mode, setMode] = useState('fixed')
  // Monday to Sunday in the app's language (1 January 2024 was a Monday).
  const days = [1, 2, 3, 4, 5, 6, 7].map(d => {
    try { return new Intl.DateTimeFormat(dateLocale(), { weekday: 'narrow' }).format(new Date(2024, 0, d)) } catch { return 'MTWTFSS'[d - 1] }
  })
  const week = ['A', null, 'B', null, 'C', null, null]
  return <div className="ag-demo">
    <Segmented value={mode} onChange={setMode} options={[{ value: 'fixed', label: t('Fixed Week') }, { value: 'rotation', label: t('Rotation') }]} />
    {mode === 'fixed' ? <div className="ag-week">
      {days.map((d, i) => <span key={i} className={'ag-day' + (week[i] ? ' on' : '')}><small>{d}</small><b>{week[i] || '·'}</b></span>)}
    </div> : <div className="ag-loop" aria-label="A, B, C">
      {['A', 'B', 'C'].map((r, i) => <span key={r} className="ag-loop-r" style={{ '--i': i }}><b>{r}</b></span>)}
      <Icon name="repeat" className="ag-loop-c" />
    </div>}
    <div className="ag-say small">{t('Fixed week repeats the same routines on the same weekdays; Rotation goes through them in order, whatever the day.')}</div>
  </div>
}

function StatsDemo() {
  const [mode, setMode] = useState('simple')
  const pts = [40, 42.5, 42.5, 45, 47.5, 47.5, 50]
  const path = pts.map((v, i) => (i ? 'L' : 'M') + (i * 40) + ',' + (60 - (v - 38) * 4)).join(' ')
  return <div className="ag-demo">
    <Segmented value={mode} onChange={setMode} options={[{ value: 'simple', label: t('Simple') }, { value: 'detailed', label: t('Detailed') }]} />
    {mode === 'simple' ? <div className="ag-hl"><span className="ag-art-i sm" style={{ '--c': 'var(--green)' }}><Icon name="arrowUp" /></span>
      <span>{t('Your squat went up {0} this month. Keep it going!', '10 kg')}</span></div>
      : <svg className="ag-chart" viewBox="-4 -4 248 72" role="img" aria-label={t('A chart of your squat over time')}>
        <path d={path} fill="none" stroke="var(--acc)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((v, i) => <circle key={i} cx={i * 40} cy={60 - (v - 38) * 4} r="3.5" fill="var(--acc)" />)}
      </svg>}
  </div>
}

const DEMOS = { tabbar: TabBarDemo, setrow: SetRowDemo, setkind: SetKindDemo, unit: UnitDemo, schedule: ScheduleDemo, stats: StatsDemo }
