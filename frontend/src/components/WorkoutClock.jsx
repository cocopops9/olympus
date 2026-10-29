// Olympus: the clock of the workout in progress (lib/workout-clock.js), in the workout header.
// The play/pause button stops and restarts it; tapping the time opens a sheet to pause, to set
// the duration so far, or to set when the workout started.
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { elapsedOf, fmtClock, isPaused, pauseClock, resumeClock, setElapsed } from '../lib/workout-clock.js'
import { Button, Stepper } from './ui.jsx'
import Icon from './Icon.jsx'
import Elapsed from './Elapsed.jsx'
import Hourglass from './Hourglass.jsx'
import Atlas from './Atlas.jsx'
import { workoutVolume } from '../lib/history.js'
import { fmtNum } from '../lib/format.js'
import '../workout-clock.css'

const edit = fn => useStore.getState().update(s => { if (s.active) fn(s.active) })
export const togglePause = () => edit(a => (isPaused(a) ? resumeClock(a) : pauseClock(a)))

const two = n => String(n).padStart(2, '0')
const timeOf = ms => { const d = new Date(ms); return two(d.getHours()) + ':' + two(d.getMinutes()) }

function ClockSheet({ close }) {
  const A = useStore(s => s.S.active)
  const [, tick] = useState(0)
  useEffect(() => { const iv = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(iv) }, [])
  if (!A) return null
  const paused = isPaused(A)
  const min = Math.floor(elapsedOf(A) / 60000)
  // A start typed as a time of day is today's, or yesterday's when that time has not come yet.
  const setStart = hhmm => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
    if (!m) return
    const d = new Date(A.start)
    d.setHours(+m[1], +m[2], 0, 0)
    let at = d.getTime()
    const limit = isPaused(A) ? A.pausedAt : Date.now()
    if (at > limit) at -= 86400000
    edit(a => { a.start = at })
  }
  return <div className="wclock-sheet">
    <h3 style={{ marginBottom: 4 }}>{t('Workout time')}</h3>
    <p className="small muted" style={{ marginTop: 0 }}>{t('The time saved with the workout is the time trained: pauses are left out.')}</p>
    <div className={'wclock-big' + (paused ? ' paused' : '')}><Elapsed active={A} /></div>
    <div className="wclock-state small muted">{paused ? t('Paused') : t('Running')}</div>
    <Button variant={paused ? 'primary' : 'tinted'} icon={paused ? 'play' : 'pause'} onClick={togglePause}>{paused ? t('Resume the clock') : t('Pause the clock')}</Button>
    <div style={{ height: 16 }} />
    <Stepper label={t('Duration so far')} unit={t('min')} value={min} step={1} min={0} max={24 * 60} decimal={false}
      onChange={v => edit(a => setElapsed(a, Math.round(v) * 60000 + (elapsedOf(a) % 60000)))} />
    <label className="wclock-start">
      <span>{t('Started at')}</span>
      <input className="input" type="time" value={timeOf(A.start)} onChange={e => setStart(e.target.value)} />
    </label>
    <div style={{ height: 18 }} />
    <Button variant="primary" onClick={close}>{t('Done')}</Button>
  </div>
}

export const workoutClockSheet = () => useUI.getState().openSheet(close => <ClockSheet close={close} />)

/** The clock in the workout header: play/pause, and the time that opens the sheet. */
export function HeaderClock({ active }) {
  const paused = isPaused(active)
  return <span className="wclock">
    <button className={'wclock-pp' + (paused ? ' paused' : '')} onClick={togglePause}
      aria-label={paused ? t('Resume the clock') : t('Pause the clock')} title={paused ? t('Resume the clock') : t('Pause the clock')}>
      <Icon name={paused ? 'play' : 'pause'} />
    </button>
    <button className="wclock-t" onClick={workoutClockSheet} aria-label={t('Workout time') + ' ' + fmtClock(elapsedOf(active))}><Elapsed active={active} /></button>
  </span>
}

/**
 * Olympus: the time and the volume of the workout in progress, big, under its name. The time
 * runs beside an hourglass (held while the clock is paused) and opens the clock's sheet; the
 * volume is that of the sets checked off so far (warm-ups left out, as everywhere), beside Atlas.
 */
export function WorkoutStats({ active, unit }) {
  const paused = isPaused(active)
  const vol = workoutVolume(active)
  return <div className="wstats">
    <div className={'wstat time' + (paused ? ' paused' : '')} role="group" aria-label={t('Workout time')}>
      <Hourglass paused={paused} size={30} />
      <button type="button" className="wstat-b" style={{ border: 0, background: 'none', padding: 0, color: 'inherit', font: 'inherit', textAlign: 'start', cursor: 'pointer' }}
        onClick={workoutClockSheet} aria-label={t('Workout time') + ' ' + fmtClock(elapsedOf(active))}>
        <span className="wstat-v"><Elapsed active={active} /></span>
        <span className="wstat-l">{paused ? t('Paused') : t('Time')}</span>
      </button>
      <button className={'wclock-pp' + (paused ? ' paused' : '')} onClick={togglePause}
        aria-label={paused ? t('Resume the clock') : t('Pause the clock')} title={paused ? t('Resume the clock') : t('Pause the clock')}>
        <Icon name={paused ? 'play' : 'pause'} />
      </button>
    </div>
    <div className="wstat vol" role="group" aria-label={t('Total volume')}>
      <Atlas size={38} />
      <span className="wstat-b">
        <span className="wstat-v">{fmtNum(Math.round(vol))}<small style={{ fontSize: 14, fontWeight: 600, marginInlineStart: 3 }}>{unit}</small></span>
        <span className="wstat-l">{t('Total volume')}</span>
      </span>
    </div>
  </div>
}
