// Olympus: telling the AI coaches what you train for (lib/coach-profile.js): how you train, the
// phase you are in, and your goals and what is coming up in your own words. Opened from the coach
// chat, the full-screen coach and Profile's AI coach card.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { TRAINING_STYLES, PHASES, GOALS_MAX, coachProfileOf } from '../lib/coach-profile.js'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import '../coach-goals.css'

function Goals({ close }) {
  const S = useStore(s => s.S)
  const [p, setP] = useState(() => coachProfileOf(S))
  const toggleStyle = id => setP(v => ({ ...v, styles: v.styles.includes(id) ? v.styles.filter(x => x !== id) : [...v.styles, id] }))
  const save = () => {
    useStore.getState().update(s => { s.coachProfile = { styles: p.styles, phase: p.phase, goals: p.goals.trim().slice(0, GOALS_MAX) } })
    close()
    useUI.getState().toast(t('Your coaches know what you train for.'))
  }
  return <div className="cg">
    <h3 style={{ marginBottom: 4 }}>{t('What you train for')}</h3>
    <p className="small muted" style={{ marginTop: 0 }}>{t('Hercules, Athena and your own coaches read this before every answer, during workouts too.')}</p>

    <div className="cg-l">{t('How you train')}</div>
    <div className="cg-grid">
      {TRAINING_STYLES.map(s => <button key={s.id} className={'cg-tile' + (p.styles.includes(s.id) ? ' on' : '')} onClick={() => toggleStyle(s.id)} aria-pressed={p.styles.includes(s.id)}>
        <Icon name={s.icon} /><span>{t(s.label)}</span>
      </button>)}
    </div>

    <div className="cg-l">{t('Your phase')} <span className="muted">({t('optional')})</span></div>
    <div className="chips oc-wrap" style={{ flexWrap: 'wrap' }}>
      {PHASES.map(x => <button key={x.id} className={'chip nocap' + (p.phase === x.id ? ' on' : '')} onClick={() => setP(v => ({ ...v, phase: v.phase === x.id ? null : x.id }))}>{t(x.label)}</button>)}
    </div>

    <label className="cg-l" htmlFor="cg-goals">{t('Your goals, in your words')}</label>
    <textarea id="cg-goals" className="input" rows={4} maxLength={GOALS_MAX} value={p.goals} onChange={e => setP(v => ({ ...v, goals: e.target.value }))}
      placeholder={t('e.g. I want progressive overload on the big lifts. Functional legs this week, but I play football in 3 days.')} />
    <div className="small dim" style={{ textAlign: 'end', marginTop: 4 }}>{p.goals.length}/{GOALS_MAX}</div>

    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
  </div>
}

export const coachGoalsSheet = () => useUI.getState().openSheet(close => <Goals close={close} />)
