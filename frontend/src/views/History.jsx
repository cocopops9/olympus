import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, tn } from '../lib/i18n.js'
import { DayNoteRow, workoutDetailSheet, logPastWorkoutSheet } from '../sheets.jsx'
import WorkoutCard, { MonthHead } from '../components/WorkoutCard.jsx'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { dayNoteOf } from '../lib/day-notes.js'

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

export default function History() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const rows = historyRows(S)
  return <>
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/profile')} aria-label={t('Profile')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('History')}</h1><div className="sub">{tn('{0} workout', '{0} workouts', S.workouts.length)}</div></div></div>
    <Button icon="plus" onClick={logPastWorkoutSheet} style={{ marginBottom: 12 }}>{t('Log a past workout')}</Button>
    {rows.length ? months(rows).map(([ym, list]) => <section key={ym} className="wmonth-s">
      <MonthHead ym={ym} list={list.filter(r => r.w).map(r => r.w)} />
      {list.map(r => r.w
        ? <WorkoutCard key={r.w.id} w={r.w} onClick={() => workoutDetailSheet(r.w)} />
        : <div key={'note-' + r.d} className="list" style={{ marginBottom: 10 }}><DayNoteRow iso={r.d} note={r.note} /></div>)}
    </section>)
      : <div className="empty"><div className="ico"><Icon name="history" /></div>{t('No workouts yet. Your first one will land here.')}</div>}
  </>
}
