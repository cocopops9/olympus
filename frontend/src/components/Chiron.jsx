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
import { canSpeak, speak, speakable, listen, stopSpeaking, canListen, warmVoice, releaseMic } from '../lib/voice.js'
import { fmtNum, exerciseNameText } from '../lib/format.js'
import { useCoachChat, Reply } from './Hercules.jsx'
import { MicButton, useCanListen } from './Voice.jsx'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import ChironFigure from './ChironFigure.jsx'
import { create } from 'zustand'
import '../chiron.css'
import '../chiron-figure.css'

const clock = sec => Math.floor(sec / 60) + ':' + String(Math.round(sec % 60)).padStart(2, '0')

/** His portrait: asleep (eyes shut, the z's drifting up), stirring as he is tapped, or awake. */
export function ChironFace({ awake = false, stir = 0, size = 40 }) {
  return <span className={'chiron-face' + (stir ? ' stir' + Math.min(stir, 2) : '')} aria-hidden="true">
    <ChironFigure state={awake ? 'idle' : 'asleep'} size={size} />
  </span>
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
    if (canSpeak()) speak(speakable(last.content), { who: 'chiron' }).catch(() => {})
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
      <button className="btn ghost sm chs-voice" onClick={() => startVoiceMode({ closeSheet: close })} title={t('Voice mode')}><Icon name="mic" />{t('Voice mode')}</button>
      <button className="iconbtn" onClick={() => { close(); sleepNow() }} aria-label={t('Let him sleep')} title={t('Let him sleep')}><Icon name="moon" /></button>
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

// Whether he is awake in the page, shared by the figure and his sheet ("Let him sleep").
export const useChiron = create(() => ({ awake: false }))
const sleepNow = () => useChiron.setState({ awake: false })

/**
 * Voice mode, asked for by its button: Chiron wakes in the page and talks with you hands free
 * (ChironVoice). A phone without speech recognition is told why it cannot, and what to turn on.
 */
export async function startVoiceMode({ closeSheet } = {}) {
  let ok = false
  try { ok = await canListen() } catch { ok = false }
  if (!ok) {
    useUI.getState().toast(t('Voice mode needs speech recognition on this phone. Turn on Google voice typing in the phone’s settings (languages and input), then try again.'))
    return false
  }
  closeSheet?.()
  useChiron.setState({ awake: true })
  return true
}

// Short answers that put him back to sleep, said on their own.
const SLEEP_WORDS = /^(?:ok(?:ay)?\s+)?(?:grazie\s+)?(?:basta|dormi|stop|sleep|go to sleep|that'?s all|thanks?|grazie|duerme|ya está|dors|schlaf|chega|dorme)[.!\s]*$/i
const isSleepWord = text => SLEEP_WORDS.test(String(text || '').trim()) && String(text).trim().split(/\s+/).length <= 4

// What he says first, with no network: the rest before the next set and that set.
// Said aloud, so in words: "2 minutes 30", not "2:30" (which a voice reads as a time of day).
function restWords(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60)
  if (!m) return tn('{0} second', '{0} seconds', s)
  return s ? t('{0} min {1} s', m, s) : tn('{0} minute', '{0} minutes', m)
}
function nextWords(next, mode, unit) {
  if (!next) return ''
  if (mode === 'time') return next.sec ? tn('{0} second', '{0} seconds', next.sec) : ''
  if (mode === 'cardio') return next.min ? tn('{0} minute', '{0} minutes', next.min) : ''
  if (next.w && next.r != null) return t('{0} {1} for {2} reps', fmtNum(next.w), unit, next.r)
  return next.r != null ? tn('{0} repetition', '{0} repetitions', next.r) : ''
}
function greeting(tips, unit) {
  if (!tips) return t('I am awake. Start an exercise and ask me anything about it.')
  const next = nextWords(tips.next, tips.mode, unit)
  return next ? t('Rest {0}, then {1}. What do you need?', restWords(tips.rest.sec), next) : t('Rest {0}. What do you need?', restWords(tips.rest.sec))
}

/**
 * Chiron awake in the page, by voice: he greets with the rest and the next set, then listens; a
 * question goes to him (api/hercules.js chiron), the answer is read aloud while his mouth moves,
 * and he listens again, until "basta", a tap on the moon, or two silences in a row (then the
 * microphone waits for a tap). The keyboard opens his sheet, to read or type instead.
 */
function ChironVoice({ tips, unit, online }) {
  const c = useCoachChat({ coach: WORKOUT_COACH })
  const chat = useRef(c)
  chat.current = c
  const [pose, setPose] = useState('waking')
  const [mouth, setMouth] = useState(0)
  const [heard, setHeard] = useState('')
  const [said, setSaid] = useState('')
  const [paused, setPaused] = useState(false)
  const live = useRef(true)
  const stopListening = useRef(null)
  const mouthTimer = useRef(null)
  const loop = useRef(0)   // which run of the loop is current: a new one makes the old stop

  // One conversation per workout, as in the sheet.
  useEffect(() => {
    const cur = c.data.chats.find(x => x.id === c.data.current)
    if (cur && useStore.getState().S.active && cur.ts < (useStore.getState().S.active.start || 0)) c.start()
  }, [])

  const say = async text => {
    const words = speakable(text)
    if (!words) return
    setSaid(words)
    // He is shown thinking until the sound really starts, then the mouth opens and shuts at the pace
    // of syllables, a little irregular, while the voice reads.
    setPose('thinking')
    const start = () => {
      setPose('speaking')
      const t0 = Date.now()
      clearInterval(mouthTimer.current)
      mouthTimer.current = setInterval(() => {
        const k = (Date.now() - t0) / 1000
        setMouth(Math.max(0, Math.abs(Math.sin(k * 11.5)) * (0.55 + 0.45 * Math.abs(Math.sin(k * 2.3)))))
      }, 80)
    }
    // A voice that never says it has finished (a WebView without voices) does not hold him: he
    // goes on after about the time the words take to say, counted from when it started.
    let giveUp
    const enough = new Promise(r => { giveUp = r; setTimeout(r, 40000) })
    const began = () => { start(); setTimeout(giveUp, 3000 + words.length * 90) }
    try { if (canSpeak()) await Promise.race([speak(words, { who: 'chiron', onStart: began }), enough]) } catch { /* read on screen instead */ }
    clearInterval(mouthTimer.current); setMouth(0)
  }
  const hear = () => new Promise(resolve => {
    // "Listening" once the microphone really records, so the first words are never said too early.
    setPose('idle'); setHeard('')
    let last = '', done = false
    // A recogniser that never starts or never stops counts as silence after 20 seconds.
    const guard = setTimeout(() => { stopListening.current?.(); end(last.trim()) }, 35000)
    const end = v => { if (!done) { done = true; clearTimeout(guard); stopListening.current = null; resolve(v) } }
    listen({ onReady: () => setPose('listening'), onText: text => { if (text) { last = text; setHeard(text) } }, onEnd: error => { if (error) useUI.getState().toast(t('The microphone stopped: {0}', error)); end(last.trim()) } })
      .then(stop => { stopListening.current = stop; if (!live.current) stop() }, e => end(e?.code === 'permission' ? false : ''))
  })

  const run = async (greet) => {
    const me = ++loop.current
    const going = () => live.current && loop.current === me
    setPaused(false)
    if (greet) {
      await new Promise(r => setTimeout(r, 350))   // the waking animation starts first
      if (!going()) return
      await say(greeting(tips, unit))
      if (!online && going()) await say(t('To answer questions I need your Olympus account and a connection. The advice above works anywhere.'))
    }
    if (!online) { if (going()) setPose('idle'); return }
    let silent = 0
    while (going()) {
      const text = await hear()
      if (!going()) return
      if (text === false) { useUI.getState().toast(t('Allow the microphone to talk to your coach.')); break }
      if (!text) { if (++silent >= 2) break; continue }
      silent = 0
      if (isSleepWord(text)) { await say(t('Good work. Call me when you need me.')); if (going()) sleepNow(); return }
      setPose('thinking')
      const reply = await chat.current.send(text)
      if (!going()) return
      await say(reply || chat.current.err || t('I could not answer that. Try again.'))
    }
    if (going()) { setPose('idle'); setPaused(true) }
  }
  const halt = () => { loop.current++; stopListening.current?.({ cancel: true }); stopSpeaking().catch(() => {}); clearInterval(mouthTimer.current); setMouth(0) }

  useEffect(() => {
    live.current = true
    warmVoice()
    run(true)
    return () => { live.current = false; halt(); releaseMic() }
  }, [])

  const toggleMic = () => {
    if (pose === 'listening') { halt(); setPose('idle'); setPaused(true); return }
    halt(); run(false)
  }
  const keyboard = () => { halt(); setPose('idle'); setPaused(true); chironSheet() }
  const status = pose === 'listening' ? t('I am listening…') : pose === 'thinking' ? t('Let me think…') : pose === 'speaking' ? t('Chiron is speaking') : paused ? t('Tap the microphone to talk to me.') : t('Your coach between sets')
  return <div className="chv" role="group" aria-label="Chiron">
    <button className="chv-fig" onClick={toggleMic} aria-label={pose === 'listening' ? t('Stop listening') : t('Talk to Chiron')}>
      <ChironFigure state={pose} mouth={mouth} size={140} />
    </button>
    <div className="chv-side">
      <div className="chv-n"><b>Chiron</b><span className={'chv-st ' + pose} aria-live="polite">{status}</span></div>
      {heard && pose !== 'speaking' && <p className="chv-heard">“{heard}”</p>}
      {said && <p className="chv-said">{said.length > 220 ? said.slice(0, 219) + '…' : said}</p>}
      <div className="chv-ctl">
        <button className={'chv-b mic' + (pose === 'listening' ? ' on' : '')} onClick={toggleMic} disabled={!online}
          aria-label={pose === 'listening' ? t('Stop listening') : t('Talk to Chiron')}><Icon name="mic" /></button>
        <button className="chv-b" onClick={keyboard} aria-label={t('Ask Chiron about this workout')}><Icon name="chat" /></button>
        <button className="chv-b" onClick={() => { halt(); sleepNow() }} aria-label={t('Let him sleep')}><Icon name="moon" /></button>
      </div>
    </div>
  </div>
}

// How long his waking is drawn (chiron-figure.css), and when the voice panel takes over from it.
const WAKE_MS = 1800
const WAKE_VOICE_MS = 1500

/**
 * Chiron in the workout page, drawn whole (components/ChironFigure.jsx): he lies there asleep,
 * breathing, the z's drifting up. Each tap makes him stir; the third wakes him: he gets up with a
 * stretch and, on a phone that can listen, talks with you by voice right there (ChironVoice);
 * otherwise his sheet opens, as it does from the voice panel's keyboard. Hidden when the coach is
 * switched off for the workout (Settings), and while logging or editing a past workout.
 */
export function WorkoutChiron() {
  const on = useStore(s => s.S.coachInWorkout !== false && !!s.S.active && !s.S.active.backfill && !s.S.active.editingWorkoutId)
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const sheetOpen = useUI(s => !!openId && s.sheets.some(x => x.id === openId))
  const voiceAwake = useChiron(s => s.awake)
  const canHear = useCanListen()
  const [tap, setTapState] = useState(null)
  // The count lives in a ref too: quick taps can come before the figure has drawn the last one.
  const tapRef = useRef(null)
  const setTap = v => { tapRef.current = v; setTapState(v) }
  const timer = useRef(null)
  const [waking, setWaking] = useState(false)
  const wasAwake = useRef(false)
  const [settling, setSettling] = useState(false)
  const awake = voiceAwake || sheetOpen
  const online0 = socialReady(user)
  useEffect(() => () => { clearTimeout(timer.current); sleepNow() }, [])
  // The server's voice is asked about while he sleeps, so waking him does not wait for it.
  useEffect(() => { if (on && online0) warmVoice() }, [on, online0])
  // Back to sleep when his sheet closes (without the voice panel): a short settling, then asleep.
  useEffect(() => {
    if (awake) { wasAwake.current = true; return }
    if (!wasAwake.current) return
    wasAwake.current = false
    setSettling(true)
    const tm = setTimeout(() => setSettling(false), 900)
    return () => clearTimeout(tm)
  }, [awake])
  if (!on) return null
  const p = coachProfileOf(S)
  const tips = quickTips(S, { exOf: id => EXIDX[id] || null, modeOf: ex => modeOf(ex), isWarmup: isWarmupRow, styles: p.styles, phase: p.phase })
  const online = socialReady(user)
  const press = () => {
    // While he is getting up the taps wait: a fourth would start the count again over the animation.
    if (awake || waking) return
    const next = tapWake(tapRef.current, Date.now())
    clearTimeout(timer.current)
    if (next.awake) {
      setTap(null)
      try { navigator.vibrate?.([12, 40, 12]) } catch { /* no haptics */ }
      setWaking(true)
      timer.current = setTimeout(() => setWaking(false), WAKE_MS)
      // By voice he starts once the flash has passed and he is on his feet, so the waking is seen;
      // the sheet covers him, and opens at once.
      if (canHear) timer.current = setTimeout(() => { setWaking(false); useChiron.setState({ awake: true }) }, WAKE_VOICE_MS)
      else chironSheet()
      return
    }
    setTap(next)
    // Left alone, he settles back to sleep and the count starts again.
    timer.current = setTimeout(() => setTap(null), 1600)
  }
  if (voiceAwake) return <div className="chiron-stage chiron-live">
    <ChironVoice tips={tips} unit={S.unit} online={online} />
  </div>
  const left = WAKE_TAPS - (tap?.taps || 0)
  const pose = waking ? 'waking' : awake ? 'idle' : 'asleep'
  return <div className="chs-wrap">
    <button className={'chiron-stage whdr-chiron ' + (settling ? 'settling' : pose) + (tap ? ' tapped stir' + Math.min(tap.taps, 2) : '')} onClick={press}
      aria-label={awake ? 'Chiron' : t('Chiron is asleep. Tap him three times to wake him.')} title="Chiron">
      <ChironFigure state={pose} size={150} className="chs-fig" />
      <span className="chs-bubble">
        <b>Chiron</b>
        <span>{awake || waking ? t('Your coach between sets') : t('Chiron is asleep. Tap him three times to wake him.')}</span>
      </span>
      {tap && !awake && <span className="chiron-taps" aria-hidden="true">{Array.from({ length: WAKE_TAPS }, (_, i) => <i key={i} className={i < WAKE_TAPS - left ? 'on' : ''} />)}</span>}
    </button>
    {!awake && <button className="chs-voice-go" onClick={() => startVoiceMode()} aria-label={t('Voice mode')} title={t('Voice mode')}>
      <Icon name="mic" /><span>{t('Voice mode')}</span>
    </button>}
  </div>
}
