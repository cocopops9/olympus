// Olympus: the Activity card of Stats. Three ways to look at the same training, time or volume:
//   Month  a calendar, each trained day a disc filled by how much was done, tap a day to open it;
//   Weeks  the last twelve weeks as bars, this week lit, the best week marked;
//   Year   the whole year as the grid it always was (components/Heatmap.jsx).
// The three numbers on top (days trained, time or volume, best run of weeks) cover the last year.
import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { t, tn } from '../lib/i18n.js'
import { fmtVol, isoOf, todayISO, DAYS, MONTHS, MONTHS_LONG, weekStartOf, weekDayOffset } from '../lib/format.js'
import { workoutDay, workoutDuration, workoutVolume } from '../lib/history.js'
import { dayNoteOf } from '../lib/day-notes.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { Segmented } from './ui.jsx'
import Icon from './Icon.jsx'
import Heatmap from './Heatmap.jsx'
import '../activity.css'

const volumeOf = w => (Array.isArray(w?.entries) ? Math.max(0, Number(workoutVolume(w)) || 0) : Math.max(0, Number(w?.vol) || 0))

/** Per day: { n, min, vol }. */
export function activityByDay(workouts) {
  const agg = {}
  for (const w of workouts || []) {
    const day = workoutDay(w)
    if (!day) continue
    const a = agg[day] = agg[day] || { n: 0, vol: 0, min: 0 }
    a.n++
    a.vol += volumeOf(w)
    a.min += Math.max(0, Math.round(workoutDuration(w) / 60000))
  }
  return agg
}

/** 0..4 for a day's value against the quartiles of all trained days. */
export function levelFor(values) {
  const sorted = values.filter(v => v > 0).sort((a, b) => a - b)
  const q = p => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0)
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75)
  return v => (v == null ? 0 : !v ? 1 : v >= t3 ? 4 : v >= t2 ? 3 : v >= t1 ? 2 : 1)
}

const fmtMin = min => (min >= 60 ? t('{0} h', Math.round(min / 6) / 10) : t('{0} min', min))

function Month({ S, agg, metric, onDay }) {
  const [offset, setOffset] = useState(0)
  const ws = weekStartOf(S)
  const today = todayISO()
  const base = new Date(); base.setHours(12, 0, 0, 0); base.setDate(1); base.setMonth(base.getMonth() + offset)
  const y = base.getFullYear(), m = base.getMonth()
  const days = new Date(y, m + 1, 0).getDate()
  const lead = weekDayOffset(new Date(y, m, 1, 12).getDay(), ws)
  const key = metric === 'vol' ? 'vol' : 'min'
  const level = levelFor(Object.values(agg).map(a => a[key]))
  const cells = []
  let n = 0, min = 0, vol = 0
  for (let i = 0; i < lead; i++) cells.push(<span key={'b' + i} className="am-d blank" />)
  for (let d = 1; d <= days; d++) {
    const iso = isoOf(new Date(y, m, d, 12))
    const a = agg[iso]
    if (a) { n += a.n; min += a.min; vol += a.vol }
    const note = !a && dayNoteOf(S, iso)
    const cls = 'am-d' + (a ? ' l' + level(a[key]) : '') + (iso === today ? ' today' : '') + (iso > today ? ' future' : '') + (note ? ' noted' : '')
    cells.push(<span key={iso} className={cls} title={iso} {...tappable(a || note ? () => onDay?.(iso) : undefined)}
      aria-label={a ? `${d} · ${tn('{0} workout', '{0} workouts', a.n)}` : String(d)}><b>{d}</b></span>)
  }
  const names = Array.from({ length: 7 }, (_, i) => t(DAYS[(ws + i) % 7]))
  return <div className="am">
    <div className="am-h">
      <button className="iconbtn sm" onClick={() => setOffset(o => o - 1)} aria-label={t('Previous month')}><Icon name="chevronLeft" /></button>
      <div className="am-t"><b>{t(MONTHS_LONG[m])} {y}</b>
        <span className="small dim">{n ? `${tn('{0} workout', '{0} workouts', n)} · ${metric === 'vol' ? fmtVol(vol, S.unit) : fmtMin(min)}` : t('No workouts')}</span></div>
      <button className="iconbtn sm" onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={offset === 0} aria-label={t('Next month')}><Icon name="chevronRight" /></button>
    </div>
    <div className="am-g am-names">{names.map((d, i) => <span key={i}>{d}</span>)}</div>
    <div className="am-g">{cells}</div>
  </div>
}

function Weeks({ S, agg, metric }) {
  const [sel, setSel] = useState(null)
  const ws = weekStartOf(S)
  const key = metric === 'vol' ? 'vol' : 'min'
  const weeks = useMemo(() => {
    const start = new Date(); start.setHours(12, 0, 0, 0); start.setDate(start.getDate() - weekDayOffset(start.getDay(), ws))
    const out = []
    for (let w = 11; w >= 0; w--) {
      const s0 = new Date(start); s0.setDate(start.getDate() - w * 7)
      let v = 0, n = 0
      for (let d = 0; d < 7; d++) { const day = new Date(s0); day.setDate(s0.getDate() + d); const a = agg[isoOf(day)]; if (a) { v += a[key]; n += a.n } }
      out.push({ iso: isoOf(s0), v, n, label: s0.getDate() + ' ' + t(MONTHS[s0.getMonth()]) })
    }
    return out
  }, [agg, key, ws])
  const max = Math.max(1, ...weeks.map(w => w.v))
  const best = weeks.reduce((b, w, i) => (w.v > (weeks[b]?.v || 0) ? i : b), 0)
  const shown = sel != null ? weeks[sel] : weeks[weeks.length - 1]
  const fmt = v => (metric === 'vol' ? fmtVol(v, S.unit) : fmtMin(v))
  return <div className="aw">
    <div className="aw-cap"><b>{fmt(shown.v)}</b>
      <span className="small dim">{sel == null || sel === weeks.length - 1 ? t('This week') : t('Week of {0}', shown.label)} · {tn('{0} workout', '{0} workouts', shown.n)}</span></div>
    <div className="aw-bars">
      {weeks.map((w, i) => <button key={w.iso} className={'aw-b' + (i === weeks.length - 1 ? ' now' : '') + (i === sel ? ' sel' : '') + (i === best && w.v > 0 ? ' best' : '')}
        onClick={() => setSel(i === sel ? null : i)} aria-label={`${w.label}: ${fmt(w.v)}`}>
        <i style={{ height: Math.max(w.v > 0 ? 6 : 2, Math.round(w.v / max * 100)) + '%' }} />
      </button>)}
    </div>
    <div className="aw-x">{weeks.map((w, i) => <span key={w.iso}>{i % 3 === 0 ? w.label : ''}</span>)}</div>
  </div>
}

export default function Activity({ S, onDay }) {
  const [view, setView] = useState('month')
  const metric = S.heatmapMetric === 'vol' ? 'vol' : 'time'
  const setMetric = v => useStore.getState().update(s => { s.heatmapMetric = v })
  const agg = useMemo(() => activityByDay(S.workouts), [S.workouts])
  // The year in three numbers.
  const since = isoOf(new Date(Date.now() - 365 * 86400000))
  const year = Object.entries(agg).filter(([d]) => d >= since)
  const totalMin = year.reduce((n, [, a]) => n + a.min, 0)
  const totalVol = year.reduce((n, [, a]) => n + a.vol, 0)
  const bestRun = useMemo(() => {
    const ws = weekStartOf(S)
    const weeks = new Set(year.map(([d]) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() - weekDayOffset(x.getDay(), ws)); return isoOf(x) }))
    let best = 0
    for (const w of weeks) {
      const prev = new Date(w + 'T12:00:00'); prev.setDate(prev.getDate() - 7)
      if (weeks.has(isoOf(prev))) continue
      let run = 0; const c = new Date(w + 'T12:00:00')
      while (weeks.has(isoOf(c))) { run++; c.setDate(c.getDate() + 7) }
      best = Math.max(best, run)
    }
    return best
  }, [agg])
  return <>
    <div className="hm-sum">
      <div><b>{year.length}</b><span>{t('days trained')}</span></div>
      <div><b>{metric === 'vol' ? fmtVol(totalVol, S.unit) : t('{0} h', Math.round(totalMin / 6) / 10)}</b><span>{metric === 'vol' ? t('lifted') : t('trained')}</span></div>
      <div><b>{bestRun}</b><span>{t('weeks in a row, best')}</span></div>
    </div>
    <div className="act-tabs">
      <Segmented value={view} onChange={setView} options={[{ value: 'month', label: t('Month') }, { value: 'weeks', label: t('Weeks') }, { value: 'year', label: t('Year') }]} />
      <Segmented value={metric} onChange={setMetric} options={[{ value: 'time', label: t('Time') }, { value: 'vol', label: t('Volume') }]} />
    </div>
    {view === 'month' ? <Month S={S} agg={agg} metric={metric} onDay={onDay} />
      : view === 'weeks' ? <Weeks S={S} agg={agg} metric={metric} />
        : <Heatmap S={S} metric={metric} onMetricChange={setMetric} onDay={onDay} hideMetric />}
  </>
}
