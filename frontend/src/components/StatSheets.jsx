// Olympus: what is behind each number at the top of Stats (views/Stats.jsx, summary card). A tap
// on a tile opens a sheet with the list it counts:
//
//   Workouts    every workout, newest first, a month per group, loaded in pages;
//   This month  the workouts of the current month;
//   Week streak the weeks of the running streak with what was done in each, and the best run;
//   PRs         every personal record: the exercise, the weight and the workout it was set in.
//
// A row opens the workout itself (workoutDetailSheet), on top of the list.
import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn, exerciseNameFor, exerciseNameClass } from '../lib/i18n.js'
import { fmtNum, fmtDate, fmtVol, todayISO, isoOf, weekKey, weekStartOf, MONTHS, MONTHS_LONG } from '../lib/format.js'
import { workoutDay, streakWeeks } from '../lib/history.js'
import { EXIDX } from '../lib/exercises.js'
import { WorkoutRow, workoutDetailSheet } from '../sheets.jsx'
import Icon from './Icon.jsx'
import '../statsheets.css'

const PAGE = 40
const newestFirst = list => [...list].sort((a, b) => (b.start || 0) - (a.start || 0))
const open = w => workoutDetailSheet(w)

/** Workouts grouped by month, newest first: [{ key: '2026-10', label, items }]. */
export function byMonth(list) {
  const out = []
  for (const w of newestFirst(list)) {
    const key = (workoutDay(w) || '').slice(0, 7)
    let g = out[out.length - 1]
    if (!g || g.key !== key) {
      const [y, m] = key.split('-').map(Number)
      out.push(g = { key, label: m ? `${t(MONTHS_LONG[m - 1])} ${y}` : '', items: [] })
    }
    g.items.push(w)
  }
  return out
}

/**
 * The weeks of the running streak, newest first: [{ iso, label, workouts }]. The current week is
 * included while it is still empty, as streakWeeks counts it (a streak is not broken until the
 * week is over).
 */
export function streakDetail(S, now = new Date()) {
  const ws = weekStartOf(S)
  const per = new Map()
  for (const w of S.workouts) {
    const k = weekKey(workoutDay(w), ws)
    if (!per.has(k)) per.set(k, [])
    per.get(k).push(w)
  }
  const weeks = []
  const cur = new Date(now); cur.setHours(12, 0, 0, 0)
  for (let i = 0; i < 520; i++) {
    const k = weekKey(isoOf(cur), ws)
    if (per.has(k)) weeks.push({ iso: k, workouts: newestFirst(per.get(k)) })
    else if (i > 0) break
    cur.setDate(cur.getDate() - 7)
  }
  // The best run of consecutive weeks ever.
  let best = 0
  for (const k of per.keys()) {
    const prev = new Date(k + 'T12:00:00'); prev.setDate(prev.getDate() - 7)
    if (per.has(isoOf(prev))) continue
    let run = 0; const c = new Date(k + 'T12:00:00')
    while (per.has(isoOf(c))) { run++; c.setDate(c.getDate() + 7) }
    best = Math.max(best, run)
  }
  return { weeks, best }
}

/** Every personal record, newest first: [{ id, w, kg }] with the heaviest done set of that exercise in `w`. */
export function recordList(S) {
  const out = []
  for (const w of newestFirst(S.workouts)) {
    for (const id of Array.isArray(w.prs) ? w.prs : []) {
      const e = (w.entries || []).find(x => x.id === id)
      const kg = Math.max(0, ...((e?.sets || []).filter(s => s.done !== false).map(s => Number(s.w) || 0)))
      out.push({ id, w, kg })
    }
  }
  return out
}

function MonthGroups({ groups, unit }) {
  const [shown, setShown] = useState(PAGE)
  let left = shown
  const cut = []
  for (const g of groups) {
    if (left <= 0) break
    cut.push({ ...g, items: g.items.slice(0, left) })
    left -= g.items.length
  }
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  return <>
    {cut.map(g => {
      const full = groups.find(x => x.key === g.key)
      const vol = full.items.reduce((n, w) => n + (w.vol || 0), 0)
      return <div key={g.key} className="stsh-group">
        <div className="stsh-gh"><b>{g.label}</b><span className="small dim">{tn('{0} workout', '{0} workouts', full.items.length)} · {fmtVol(vol, unit)}</span></div>
        <div className="list">{g.items.map(w => <WorkoutRow key={w.id} w={w} onClick={() => open(w)} />)}</div>
      </div>
    })}
    {shown < total && <button className="btn ghost full stsh-more" onClick={() => setShown(n => n + PAGE)}>{t('Show more')} ({total - shown})</button>}
  </>
}

function Head({ icon, title, value, sub }) {
  return <div className="stsh-head">
    <span className="stsh-ic"><Icon name={icon} /></span>
    <div className="grow"><h3>{title}</h3>{sub && <div className="small dim">{sub}</div>}</div>
    <b className="stsh-v">{value}</b>
  </div>
}

function WorkoutsSheet({ month }) {
  const S = useStore(s => s.S)
  const list = useMemo(() => month ? S.workouts.filter(w => (workoutDay(w) || '').slice(0, 7) === todayISO().slice(0, 7)) : S.workouts, [S.workouts, month])
  const groups = useMemo(() => byMonth(list), [list])
  const mins = Math.round(list.reduce((n, w) => n + Math.max(0, (w.end || 0) - (w.start || 0)), 0) / 60000)
  const time = mins >= 60 ? t('{0} h', Math.round(mins / 6) / 10) : t('{0} min', mins)
  return <div className="stsh">
    <Head icon={month ? 'calendar' : 'dumbbell'} title={month ? t('This month') : t('Workouts')} value={list.length}
      sub={list.length ? `${time} · ${fmtVol(list.reduce((n, w) => n + (w.vol || 0), 0), S.unit)}` : null} />
    {list.length ? <MonthGroups groups={groups} unit={S.unit} />
      : <div className="empty small">{month ? t('No workouts this month yet.') : t('No workouts yet.')}</div>}
  </div>
}

function StreakSheet() {
  const S = useStore(s => s.S)
  const { weeks, best } = useMemo(() => streakDetail(S), [S.workouts, S.weekStart])
  const n = streakWeeks(S)
  const thisWeek = weekKey(todayISO(), weekStartOf(S))
  const label = iso => { const d = new Date(iso + 'T12:00:00'); return t('Week of {0}', d.getDate() + ' ' + t(MONTHS[d.getMonth()])) }
  return <div className="stsh">
    <Head icon="flame" title={t('Week streak')} value={n} sub={t('Best: {0}', tn('{0} week', '{0} weeks', best))} />
    <p className="small dim stsh-note">{t('A week counts when you train at least once in it. The current week keeps the streak alive until it ends.')}</p>
    {weeks.length ? <div className="list">
      {weeks.map(wk => <div key={wk.iso} className="stsh-week">
        <div className="stsh-gh"><b>{wk.iso === thisWeek ? t('This week') : label(wk.iso)}</b>
          <span className="small dim">{tn('{0} workout', '{0} workouts', wk.workouts.length)}</span></div>
        {wk.workouts.map(w => <WorkoutRow key={w.id} w={w} onClick={() => open(w)} />)}
      </div>)}
    </div> : <div className="empty small">{t('Train this week to start a streak.')}</div>}
  </div>
}

function RecordsSheet() {
  const S = useStore(s => s.S)
  const list = useMemo(() => recordList(S), [S.workouts])
  const [shown, setShown] = useState(PAGE)
  return <div className="stsh">
    <Head icon="trophy" title={t('PRs')} value={list.length} sub={list.length ? t('Each time a lift beat its best weight') : null} />
    {list.length ? <div className="list">
      {list.slice(0, shown).map((r, i) => {
        const ex = EXIDX[r.id]
        return <div key={r.w.id + r.id + i} className="item" role="button" tabIndex={0} onClick={() => open(r.w)} onKeyDown={e => { if (e.key === 'Enter') open(r.w) }}>
          <span className="lrow-i stsh-pr"><Icon name="trophy" /></span>
          <div className="grow"><div className={'tt ' + exerciseNameClass(ex)}>{ex ? exerciseNameFor(ex) : r.id}</div>
            <div className="ss">{[fmtDate(workoutDay(r.w), true), r.w.name].filter(Boolean).join(' · ')}</div></div>
          {r.kg > 0 && <b className="stsh-kg">{fmtNum(r.kg)} {S.unit}</b>}
          <Icon name="chevronRight" className="chev" />
        </div>
      })}
      {shown < list.length && <button className="btn ghost full stsh-more" onClick={() => setShown(n => n + PAGE)}>{t('Show more')} ({list.length - shown})</button>}
    </div> : <div className="empty small">{t('No records yet. Lift more than your best and it shows up here.')}</div>}
  </div>
}

const sheet = el => useUI.getState().openSheet(() => el)
export const workoutsSheet = () => sheet(<WorkoutsSheet />)
export const monthSheet = () => sheet(<WorkoutsSheet month />)
export const streakSheet = () => sheet(<StreakSheet />)
export const recordsSheet = () => sheet(<RecordsSheet />)
