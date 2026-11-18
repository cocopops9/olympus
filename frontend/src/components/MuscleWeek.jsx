// The exercises behind one muscle of the Profile's "Muscles this week" map: tapped on the body,
// the muscle opens this sheet, its exercises listed by how much of the muscle's shading each one
// earned (lib/muscles.js muscleContributions). One tap on an exercise opens its history.
import { useUI } from '../store/useUI.js'
import { MUSCLE_NAME, SECONDARY, muscleContributions } from '../lib/muscles.js'
import { exOr } from '../lib/exercises.js'
import { t, tn, exerciseNameFor, exerciseNameClass } from '../lib/i18n.js'
import { fmtNum } from '../lib/format.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { exerciseHistorySheet } from '../sheets.jsx'
import { Thumb } from './Media.jsx'
import Icon from './Icon.jsx'

// A custom exercise deleted since keeps the name its workouts logged it under.
function exerciseOf(row) {
  const ex = exOr(row.id)
  return ex.missing && row.ex?.n ? { ...ex, n: row.ex.n, missing: false } : ex
}

export function MuscleWeek({ slug, workouts, close }) {
  const rows = muscleContributions(workouts, slug)
  return <>
    <h3>{t('Exercises for {0}', t(MUSCLE_NAME[slug] || slug))}</h3>
    <div className="small muted" style={{ marginBottom: 10 }}>
      {t('Most work first: a set counts 1 where this is the main muscle, {0} where it only helps.', fmtNum(SECONDARY))}
    </div>
    {rows.length ? <div className="list">{rows.map(row => {
      const ex = exerciseOf(row)
      return <div key={row.id} className="item" {...tappable(() => { close(); exerciseHistorySheet(row.id) })}>
        <Thumb ex={ex} />
        <div className="grow">
          <div className={'tt ' + exerciseNameClass(ex)}>{exerciseNameFor(ex)}</div>
          <div className="ss">{tn('{0} set', '{0} sets', row.sets)} · {t(row.weight >= 1 ? 'Primary target' : 'Also trains')}</div>
        </div>
        <span className="tag acc nocap">{fmtNum(Math.round(row.share * 100))}%</span>
        <Icon name="chevronRight" className="chev" />
      </div>
    })}</div>
      : <div className="empty">{t('No exercise trained for this muscle yet.')}</div>}
  </>
}

export const muscleWeekSheet = (slug, workouts) =>
  useUI.getState().openSheet(close => <MuscleWeek slug={slug} workouts={workouts} close={close} />)
