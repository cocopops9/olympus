// Olympus: a finished workout as History shows it: its name, day and time, the totals, and every
// exercise with its sets and best set, so the list reads as your training rather than as a list
// of names to open one by one. A tap opens the full workout.
import { useStore } from '../store/useStore.js'
import { tn, exerciseNameFor, exerciseNameClass, dateLocale } from '../lib/i18n.js'
import { EXIDX } from '../lib/exercises.js'
import { fmtDate, fmtDur, fmtNum } from '../lib/format.js'
import { workoutVolume, workoutDuration, setsDone, setLabel } from '../lib/history.js'
import { isWarmupRow } from '../lib/workout-model.js'
import { speedUnitOf } from '../lib/speed.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { Medal } from './RecordMedals.jsx'
import Icon from './Icon.jsx'
import '../history.css'

const SHOWN = 5

// The set that says most about an entry: the heaviest work set, then the most reps.
function bestSet(entry) {
  let best = null
  for (const s of entry.sets || []) {
    if (!s || !s.done || isWarmupRow(s)) continue
    if (!best || (Number(s.w) || 0) > (Number(best.w) || 0) || ((Number(s.w) || 0) === (Number(best.w) || 0) && (Number(s.r) || 0) > (Number(best.r) || 0))) best = s
  }
  return best
}

export const volumeOf = w => (Number.isFinite(w?.vol) ? w.vol : workoutVolume(w))

export default function WorkoutCard({ w, onClick }) {
  const S = useStore(s => s.S)
  const unit = S.unit || 'kg'
  const entries = (w.entries || []).filter(e => (e.sets || []).some(s => s?.done))
  const dur = workoutDuration(w)
  const vol = volumeOf(w)
  const records = new Set([...(w.prs || []), ...entries.filter(e => e.rec?.length).map(e => e.id)]).size
  return <div className="wcard" {...tappable(onClick)}>
    <div className="wcard-h">
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="wcard-n">{w.name}</div>
        <div className="wcard-d">{fmtDate(w.d, true)}</div>
      </div>
      {records > 0 && <span className="wcard-rec"><Medal />{records}</span>}
      <Icon name="chevronRight" className="chev" />
    </div>
    <div className="wcard-tot">
      {dur > 60000 && <span><Icon name="timer" />{fmtDur(dur)}</span>}
      {vol > 0 && <span><Icon name="barbell" />{fmtNum(Math.round(vol))} {unit}</span>}
      <span><Icon name="check" />{tn('{0} set', '{0} sets', setsDone(w))}</span>
    </div>
    {entries.length > 0 && <div className="wcard-ex">
      {entries.slice(0, SHOWN).map((e, i) => {
        const ex = EXIDX[e.id]
        const done = e.sets.filter(s => s?.done && !isWarmupRow(s)).length
        const best = bestSet(e)
        return <div key={i} className="wcard-row">
          <span className={'wcard-en ' + (ex ? exerciseNameClass(ex) : '')}>{done} × {ex ? exerciseNameFor(ex) : (e.n || e.id)}</span>
          {best && <span className="wcard-best">{setLabel(e.id, best, e.target, speedUnitOf(S))}</span>}
        </div>
      })}
      {entries.length > SHOWN && <div className="wcard-more">{tn('{0} more exercise', '{0} more exercises', entries.length - SHOWN)}</div>}
    </div>}
  </div>
}

/** The month a group of workouts falls in, with its totals, as History heads each one. */
export function MonthHead({ ym, list }) {
  const S = useStore(s => s.S)
  const [y, m] = ym.split('-').map(Number)
  const label = new Date(y, m - 1, 15).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' })
  const vol = list.reduce((n, w) => n + (volumeOf(w) || 0), 0)
  const dur = list.reduce((n, w) => n + (workoutDuration(w) || 0), 0)
  return <div className="wmonth">
    <h3 className="capitalize">{label}</h3>
    <span className="small muted">{[tn('{0} workout', '{0} workouts', list.length), vol > 0 && fmtNum(Math.round(vol)) + ' ' + (S.unit || 'kg'), dur > 60000 && fmtDur(dur)].filter(Boolean).join(' · ')}</span>
  </div>
}

