// Olympus: the strength level of each main lift (lib/strength-level.js), on the Profile's
// Overview: the level, the estimated one-rep max it comes from, how much of the way to the
// next level, and what that next level starts at. Without sex, birth date and body weight
// it says what is missing and opens the form for it.
import { useMemo } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, exerciseNameFor } from '../lib/i18n.js'
import { EXIDX } from '../lib/exercises.js'
import { fmtNum } from '../lib/format.js'
import { strengthLevels, missingFor, ageOn, LIFTS } from '../lib/strength-level.js'
import { lastBW } from '../lib/history.js'
import { aboutYouSheet } from './AboutYou.jsx'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import '../strength.css'

export const levelLabel = lvl => (lvl === 'beginner' ? t('Beginner') : lvl === 'intermediate' ? t('Intermediate')
  : lvl === 'advanced' ? t('Advanced') : lvl === 'elite' ? t('Elite') : lvl)

const pct = p => Math.round(Math.max(1, Math.min(99, p * 100)))

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
  const missing = missingFor(S)
  const levels = useMemo(() => strengthLevels(S), [S])
  const unit = S.unit || 'kg'
  const trainedAny = useMemo(() => LIFTS.some(l => (S.workouts || []).some(w => (w.entries || []).some(e => e.id === l.id))), [S.workouts])

  return <div className="ov-card sl">
    <div className="row between" style={{ alignItems: 'center' }}>
      <h3 style={{ margin: 0 }}>{t('Strength level')}</h3>
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
          <div className="small muted sl-who">{t(S.body === 'female' ? 'Female' : 'Male')} · {t('Age {0}', ageOn(S.birth))} · {fmtNum(lastBW(S).w)} {unit}</div>
          {levels.map(x => <div key={x.lift.key} className={'sl-row lvl-' + x.level}>
            <div className="row between" style={{ alignItems: 'baseline', gap: 8 }}>
              <span className="sl-name capitalize">{EXIDX[x.lift.id] ? exerciseNameFor(EXIDX[x.lift.id]) : x.lift.name}</span>
              <span className={'sl-badge lvl-' + x.level}>{levelLabel(x.level)}</span>
            </div>
            <div className="sl-bar" aria-hidden="true"><i style={{ width: Math.round(x.progress * 100) + '%' }} /></div>
            <div className="small muted row between">
              <span>{t('Est. 1RM')} {fmtNum(Math.round(x.oneRm * 2) / 2)} {unit} · {t('stronger than {0}%', pct(x.percentile))}</span>
              {x.next && <span>{t('{0} from {1}', levelLabel(x.next.level), fmtNum(Math.ceil(x.next.weight)) + ' ' + unit)}</span>}
            </div>
          </div>)}
        </>}
  </div>
}
