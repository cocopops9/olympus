// Olympus: Chiron, the coach of the workout in progress. He sleeps in the workout header, in
// place of Hercules and Athena; three quick taps wake him (lib/chiron.js tapWake), and his sheet
// opens at once with what needs no network: the rest before the next set, with a button that
// starts it, and that set's weight and reps. Under it, one-tap questions, a field and the
// microphone, for anything else about the workout (api/hercules.js chiron: free, short answers,
// the rest of the world politely sent away). Asked by voice, he answers aloud. Closed, he falls
// asleep again. His conversations go in the memory every coach shares (lib/coach-memory.js), one
// per workout.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { EXIDX, exOr } from '../lib/exercises.js'
import { modeOf } from '../lib/history.js'
import { isWarmupRow } from '../lib/workout-model.js'
import { coachProfileOf } from '../lib/coach-profile.js'
import { tapWake, quickTips, WAKE_TAPS } from '../lib/chiron.js'
import { WORKOUT_COACH } from '../lib/hercules.js'
import { socialReady } from '../lib/social.js'
import { canSpeak, speak, speakable } from '../lib/voice.js'
import { fmtNum, exerciseNameText } from '../lib/format.js'
import { chironMarkup } from './ChironArt.js'
import { useCoachChat, Reply } from './Hercules.jsx'
import { MicButton } from './Voice.jsx'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import '../chiron.css'

const clock = sec => Math.floor(sec / 60) + ':' + String(Math.round(sec % 60)).padStart(2, '0')
const SLEEP = chironMarkup()
const AWAKE = chironMarkup({ awake: true })

/** His portrait: asleep (eyes shut, the z's drifting up), stirring as he is tapped, or awake. */
export function ChironFace({ awake = false, stir = 0, size = 40 }) {
  return <span className={'chiron-face' + (awake ? ' awake' : ' asleep') + (stir ? ' stir' + Math.min(stir, 2) : '')}
    style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: awake ? AWAKE : SLEEP }} />
}

// The sheet he is awake in, if it is open: the header figure opens its eyes while it is.
let openId = null

const WHY = {
  strength: () => t('Heavy sets of 1 to 5 reps: 3 to 5 minutes lets your strength come back.'),
  'hypertrophy-compound': () => t('Muscle-building sets on a big lift: 2 to 3 minutes keeps the next set as strong.'),
  'hypertrophy-isolation': () => t('A smaller lift recovers faster: 1 to 2 minutes is enough.'),
  endurance: () => t('Light sets with many reps: short rests, 30 to 90 seconds.'),
  timed: () => t('Timed work: about a minute between rounds.'),
}

function setText(next, mode, unit) {
  if (!next) return ''
  if (mode === 'time') return next.sec ? next.sec + ' s' : ''
  if (mode === 'cardio') return next.min ? next.min + ' min' : ''
  const reps = next.r != null ? '× ' + next.r : ''
  return next.w ? `${fmtNum(next.w)} ${unit} ${reps}`.trim() : reps
}

// The questions that come up between sets, one tap each.
const QUESTIONS = () => [
  t('How much weight on the next set?'),
  t('How many reps should I do?'),
  t('What should I do next?'),
  t('Swap this exercise for me'),
]

function ChironSheet({ close }) {
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const A = S.active
  const p = coachProfileOf(S)
  const tips = quickTips(S, { exOf: id => EXIDX[id] || null, modeOf: ex => modeOf(ex), isWarmup: isWarmupRow, styles: p.styles, phase: p.phase })
  const c = useCoachChat({ coach: WORKOUT_COACH })
  const online = socialReady(user) && c.status?.on !== false
  const spoken = useRef(false)
  const mic = useRef(null)
  const [heard, setHeard] = useState('')

  // One conversation per workout: a new one when the last was from an earlier session.
  useEffect(() => {
    const cur = c.data.chats.find(x => x.id === c.data.current)
    if (cur && A && cur.ts < (A.start || 0)) c.start()
  }, [])
  // Asked by voice: the answer is read aloud, then the sheet is still there to read.
  const last = c.list[c.list.length - 1]
  useEffect(() => {
    if (!spoken.current || !last || last.role !== 'assistant') return
    spoken.current = false
    if (canSpeak()) speak(speakable(last.content)).catch(() => {})
  }, [last?.ts])

  const ask = (text, byVoice = false) => { spoken.current = byVoice; setHeard(''); c.send(text) }
  const rest = tips?.rest
  const name = tips ? exerciseNameText(exOr(tips.id)) : ''
  const shown = c.list.slice(-4)

  return <div className="chs">
    <div className="chs-h">
      <ChironFace awake size={58} />
      <div className="grow">
        <div className="chs-n">Chiron</div>
        <div className="chs-s">{t('Your coach between sets')}</div>
      </div>
      <button className="iconbtn" onClick={close} aria-label={t('Let him sleep')} title={t('Let him sleep')}><Icon name="moon" /></button>
    </div>

    {tips ? <div className="chs-tips">
      <div className="chs-ex">{name}</div>
      <div className="chs-tip">
        <span className="chs-ti"><Icon name="timer" /></span>
        <div className="grow">
          <b>{t('Rest {0}', clock(rest.sec))}</b>
          <div className="small muted">{t('{0} to {1} for this set', clock(rest.low), clock(rest.high))}</div>
        </div>
        <Button size="sm" variant="primary" icon="play" onClick={() => { useUI.getState().startRest(rest.sec, A.cur); close() }}>{t('Start')}</Button>
      </div>
      <div className="chs-tip">
        <span className="chs-ti"><Icon name="barbell" /></span>
        <div className="grow">
          {tips.next
            ? <><b>{t('Next set: {0}', setText(tips.next, tips.mode, S.unit))}</b>
              <div className="small muted">{tn('{0} set left', '{0} sets left', tips.left)}</div></>
            : <b>{t('This exercise is done.')}</b>}
        </div>
      </div>
      <p className="chs-why small muted">{WHY[rest.why]()}</p>
    </div> : <p className="muted">{t('Start an exercise and I will tell you how to rest and what to lift.')}</p>}

    {online ? <>
      {shown.length > 0 && <div className="chs-talk">
        {shown.map((m, i) => <div key={(m.ts || 0) + ':' + i} className={'chs-m ' + (m.role === 'user' ? 'me' : 'him')}>
          {m.role === 'user' ? m.content : <Reply m={m} onApplied={k => c.markApplied(c.list.length - shown.length + i, k)} />}
        </div>)}
      </div>}
      {c.busy && <div className="chs-m him chs-think" aria-live="polite"><span /><span /><span /></div>}
      {c.err && <div className="chs-err small">{c.err}</div>}
      {!c.busy && <div className="chs-q">
        {QUESTIONS().map(q => <button key={q} className="chip nocap" onClick={() => ask(q)}>{q}</button>)}
      </div>}
      <form className="chs-in" onSubmit={e => { e.preventDefault(); ask(c.draft) }}>
        <input ref={c.input} className="field" value={heard || c.draft} maxLength={600} placeholder={t('Ask Chiron about this workout')}
          aria-label={t('Ask Chiron about this workout')} onChange={e => { setHeard(''); c.setDraft(e.target.value) }} />
        <MicButton control={mic} disabled={c.busy} onText={setHeard} onFinal={text => ask(text, true)} />
        <button type="submit" className="iconbtn chs-send" disabled={c.busy || !(heard || c.draft).trim()} aria-label={t('Send')}><Icon name="arrowUp" /></button>
      </form>
      {c.left != null && <div className="chs-left small muted">{tn('{0} message left today', '{0} messages left today', c.left)}</div>}
    </> : <p className="small muted chs-off">{t('Questions to Chiron need an Olympus account and a connection. The advice above works anywhere.')}</p>}
  </div>
}

export function chironSheet() {
  const h = useUI.getState().openSheet(close => <ChironSheet close={close} />)
  openId = h?.id || null
  return h
}

/**
 * Chiron in the workout page, not a little icon: he lies there asleep, breathing, the z's
 * drifting up, with a line saying how to wake him. Each tap makes him stir; the third wakes him,
 * and he wakes for real: he stretches, opens his eyes, rises with a glow and says he is ready,
 * while his sheet comes up. Closed, he settles back to sleep. Hidden when the coach is switched
 * off for the workout (Settings), and while logging or editing a past workout.
 */
export function WorkoutChiron() {
  const on = useStore(s => s.S.coachInWorkout !== false && !!s.S.active && !s.S.active.backfill && !s.S.active.editingWorkoutId)
  const awake = useUI(s => !!openId && s.sheets.some(x => x.id === openId))
  const [tap, setTapState] = useState(null)
  // The count lives in a ref too: quick taps can come before the figure has drawn the last one.
  const tapRef = useRef(null)
  const setTap = v => { tapRef.current = v; setTapState(v) }
  const timer = useRef(null)
  const [waking, setWaking] = useState(false)
  const wasAwake = useRef(false)
  const [settling, setSettling] = useState(false)
  useEffect(() => () => clearTimeout(timer.current), [])
  // Back to sleep when his sheet closes: a short settling animation, then asleep.
  useEffect(() => {
    if (awake) { wasAwake.current = true; return }
    if (!wasAwake.current) return
    wasAwake.current = false
    setSettling(true)
    const tm = setTimeout(() => setSettling(false), 900)
    return () => clearTimeout(tm)
  }, [awake])
  if (!on) return null
  const press = () => {
    if (awake) return
    const next = tapWake(tapRef.current, Date.now())
    clearTimeout(timer.current)
    if (next.awake) {
      setTap(null)
      try { navigator.vibrate?.([12, 40, 12]) } catch { /* no haptics */ }
      setWaking(true)
      timer.current = setTimeout(() => setWaking(false), 1200)
      chironSheet()
      return
    }
    setTap(next)
    // Left alone, he settles back to sleep and the count starts again.
    timer.current = setTimeout(() => setTap(null), 1600)
  }
  const left = WAKE_TAPS - (tap?.taps || 0)
  const state = waking ? 'waking' : awake ? 'awake' : settling ? 'settling' : 'asleep'
  return <button className={'chiron-stage whdr-chiron ' + state + (tap ? ' tapped' : '')} onClick={press}
    aria-label={awake ? 'Chiron' : t('Chiron is asleep. Tap him three times to wake him.')} title="Chiron">
    <span className="chs-halo" aria-hidden="true" />
    <ChironFace awake={awake || waking} stir={tap?.taps || 0} size={64} />
    <span className="chs-say">
      <b>Chiron</b>
      <span>{awake || waking ? t('Your coach between sets') : t('Chiron is asleep. Tap him three times to wake him.')}</span>
    </span>
    {tap && !awake && <span className="chiron-taps" aria-hidden="true">{Array.from({ length: WAKE_TAPS }, (_, i) => <i key={i} className={i < WAKE_TAPS - left ? 'on' : ''} />)}</span>}
  </button>
}
