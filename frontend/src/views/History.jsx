import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { DayNoteRow, workoutDetailSheet, logPastWorkoutSheet } from '../sheets.jsx'
import WorkoutCard, { MonthHead } from '../components/WorkoutCard.jsx'
import Icon from '../components/Icon.jsx'
import { dayNoteOf } from '../lib/day-notes.js'
import { fmtDur, fmtNum } from '../lib/format.js'
import { workoutDuration } from '../lib/history.js'
import { volumeOf } from '../components/WorkoutCard.jsx'

// Newest first: every workout, and in between them the days off you left a note on (#261). A
// note on a day that has a workout too stays in the day sheet; the workout speaks for that day.
export function historyRows(S) {
  const trained = new Set((S.workouts || []).map(w => w?.d))
  const notes = Object.keys(S.dayNotes || {}).filter(d => !trained.has(d)).map(d => ({ d, note: dayNoteOf(S, d) })).filter(x => x.note)
  const rows = [...(S.workouts || []).map(w => ({ d: w.d, w })), ...notes]
  // Stable, so workouts keep the order they are stored in (by day, then start) within a day.
  return rows.map((r, i) => [r, i]).sort((a, b) => (a[0].d < b[0].d ? 1 : a[0].d > b[0].d ? -1 : b[1] - a[1])).map(([r]) => r)
}

// The rows by month, newest first: [['2026-10', rows], ...].
function months(rows) {
  const out = []
  for (const r of rows) {
    const ym = String(r.d || '').slice(0, 7)
    if (!out.length || out[out.length - 1][0] !== ym) out.push([ym, []])
    out[out.length - 1][1].push(r)
  }
  return out
}

// 12,400 reads "12.4k": the card above it is narrow.
const compact = v => (v >= 10000 ? Math.round(v / 100) / 10 + 'k' : fmtNum(Math.round(v)))

export default function History() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const rows = historyRows(S)
  return <>
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/profile')} aria-label={t('Profile')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('History')}</h1></div></div>
    {S.workouts.length > 0 && <div className="hist-stats">
      <div><b>{S.workouts.length}</b><span>{t('Workouts')}</span></div>
      <div><b>{fmtDur(S.workouts.reduce((n, w) => n + (workoutDuration(w) || 0), 0))}</b><span>{t('Time')}</span></div>
      <div><b>{compact(S.workouts.reduce((n, w) => n + (volumeOf(w) || 0), 0))}</b><span>{t('Volume')} ({S.unit || 'kg'})</span></div>
    </div>}
    <button type="button" className="hist-log" onClick={logPastWorkoutSheet}><Icon name="plus" />{t('Log a past workout')}</button>
    {rows.length ? months(rows).map(([ym, list]) => <section key={ym} className="wmonth-s">
      <MonthHead ym={ym} list={list.filter(r => r.w).map(r => r.w)} />
      {list.map(r => r.w
        ? <WorkoutCard key={r.w.id} w={r.w} onClick={() => workoutDetailSheet(r.w)} />
        : <div key={'note-' + r.d} className="list" style={{ marginBottom: 10 }}><DayNoteRow iso={r.d} note={r.note} /></div>)}
    </section>)
      : <div className="empty"><div className="ico"><Icon name="history" /></div>{t('No workouts yet. Your first one will land here.')}</div>}
  </>
}
