// Olympus: the strength level of each main lift (lib/strength-level.js), on the Profile's
// Overview: the level, the estimated one-rep max it comes from, how much of the way to the
// next level, and what that next level starts at. Without sex, birth date and body weight
// it says what is missing and opens the form for it.
import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, exerciseNameFor } from '../lib/i18n.js'
import { EXIDX } from '../lib/exercises.js'
import { fmtNum } from '../lib/format.js'
import { strengthLevels, missingFor, ageOn, METRICS } from '../lib/strength-level.js'
import { lastBW } from '../lib/history.js'
import { aboutYouSheet } from './AboutYou.jsx'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import '../strength.css'

export const levelLabel = lvl => (lvl === 'beginner' ? t('Beginner') : lvl === 'intermediate' ? t('Intermediate')
  : lvl === 'advanced' ? t('Advanced') : lvl === 'elite' ? t('Elite') : lvl)

const pct = p => Math.round(Math.max(1, Math.min(99, p * 100)))

/** A level's value as read: "120 kg" (an estimated one-rep max), "18 reps", "12.5 km/h". */
export function levelValue(type, v, unit) {
  if (type === 'reps') return t('{0} reps', fmtNum(Math.round(v)))
  if (type === 'speed') return fmtNum(Math.round(v * 10) / 10) + ' km/h'
  return fmtNum(Math.round(v * 2) / 2) + ' ' + unit
}
const OPEN_KEY = 'olympus_levels_open'
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) === '1' } catch { return false } }
const writeOpen = v => { try { localStorage.setItem(OPEN_KEY, v ? '1' : '0') } catch { /* remembered for this visit only */ } }

function aboutSheet() {
  useUI.getState().openSheet(close => <>
    <h3 style={{ marginBottom: 8 }}>{t('How the levels are worked out')}</h3>
    <p className="small" style={{ lineHeight: 1.45 }}>{t('Your best estimated one-rep max of the last 12 months is compared with lifters of your sex, age and body weight. Among people who train, the ratio of a lift to body weight is close to a log-normal distribution; Olympus centres it for your age (strength peaks between about 23 and 35) and scales it for your weight (strength grows with about body weight to the power 2/3).')}</p>
    <p className="small" style={{ lineHeight: 1.45 }}>{t('Beginner: below the 30th percentile. Intermediate: 30th to 80th. Advanced: 80th to 97.5th. Elite: above the 97.5th.')}</p>
    <p className="small muted" style={{ lineHeight: 1.45 }}>{t('The reference figures are rounded from common strength standards, not from a scientific study: read the level as an estimate that shows your progress, not as a measurement.')}</p>
    <Button onClick={close}>{t('Close')}</Button>
  </>)
}

export default function StrengthLevels() {
  const S = useStore(s => s.S)
  const [open, setOpen] = useState(readOpen)
  const missing = missingFor(S)
  const levels = useMemo(() => strengthLevels(S), [S])
  const unit = S.unit || 'kg'
  const trainedAny = useMemo(() => METRICS.some(l => (S.workouts || []).some(w => (w.entries || []).some(e => e.id === l.id))), [S.workouts])
  const toggle = () => { setOpen(!open); writeOpen(!open) }
  const top = levels[0]
  const nameOf = x => (EXIDX[x.lift.id] ? exerciseNameFor(EXIDX[x.lift.id]) : x.lift.name)

  // Folded by default: one line, opened on a tap (and remembered), never in the way.
  return <div className={'ov-card sl' + (open ? ' open' : '')}>
    <button className="sl-head" onClick={toggle} aria-expanded={open}>
      <span className="sl-head-t">
        <b>{t('Strength and performance levels')}</b>
        {!open && <span className="small muted">{missing.length ? t('Add your details to see your levels.')
          : top ? `${nameOf(top)}: ${levelLabel(top.level)}` + (levels.length > 1 ? ' · ' + t('{0} exercises', levels.length) : '') : t('Log a set to see your levels.')}</span>}
      </span>
      <Icon name={open ? 'chevronUp' : 'chevronDown'} />
    </button>
    {open && <>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: -4 }}>
        <button className="iconbtn" onClick={aboutSheet} aria-label={t('How the levels are worked out')}><Icon name="info" /></button>
      </div>
      {missing.length > 0 ? <div className="sl-missing">
        <p className="small muted">{missing.includes('birth') && missing.includes('weight') ? t('Add your date of birth and body weight to see your level at the main lifts.')
          : missing.includes('birth') ? t('Add your date of birth to see your level at the main lifts.')
            : t('Add your body weight to see your level at the main lifts.')}</p>
        <Button size="sm" variant="tinted" icon="person" onClick={aboutYouSheet}>{t('About you')}</Button>
      </div>
        : !levels.length ? <p className="small muted sl-missing">{trainedAny
          ? t('No main lift in the last 12 months with a set of 12 reps or fewer.')
          : t('Log a squat, bench press, deadlift, overhead press or barbell row to see your level.')}</p>
          : <>
            <div className="small muted sl-who">{t(S.body === 'female' ? 'Female' : 'Male')} · {t('Age {0}', ageOn(S.birth))} · {fmtNum(lastBW(S).w)} {unit} · {t('Your most trained exercises first.')}</div>
            {levels.map(x => <div key={x.lift.key} className={'sl-row lvl-' + x.level}>
              <div className="row between" style={{ alignItems: 'baseline', gap: 8 }}>
                <span className="sl-name capitalize">{nameOf(x)}</span>
                <span className={'sl-badge lvl-' + x.level}>{levelLabel(x.level)}</span>
              </div>
              <div className="sl-bar" aria-hidden="true"><i style={{ width: Math.round(x.progress * 100) + '%' }} /></div>
              <div className="small muted row between">
                <span>{x.type === 'load' ? t('Est. 1RM') + ' ' : x.type === 'speed' ? t('Best pace') + ' ' : t('Best set') + ' '}{levelValue(x.type, x.value, unit)} · {t('better than {0}%', pct(x.percentile))}</span>
                {x.next && <span>{t('{0} from {1}', levelLabel(x.next.level), x.type === 'load' ? fmtNum(Math.ceil(x.next.weight)) + ' ' + unit : levelValue(x.type, x.type === 'reps' ? Math.ceil(x.next.value) : x.next.value, unit))}</span>}
              </div>
            </div>)}
          </>}
    </>}
  </div>
}
