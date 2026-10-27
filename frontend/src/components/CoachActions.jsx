// Olympus: the changes a coach proposes (lib/coach-actions.js), as cards under its message: what
// the change is, and Apply. Applied, the card says so and stays that way in the conversation.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { describeAction, applyAction } from '../lib/coach-actions.js'
import { nav } from '../lib/nav.js'
import Icon from './Icon.jsx'
import '../coach-actions.css'

function Card({ a, applied, onApplied }) {
  const S = useStore(s => s.S)
  const [err, setErr] = useState('')
  const [made, setMade] = useState(null)
  const d = describeAction(a, S)
  const apply = () => {
    let res = null
    try {
      useStore.getState().update(s => { res = applyAction(s, a) })
      setErr(''); setMade(res); onApplied()
      useUI.getState().toast(t('Done: {0}', d.title))
    } catch (e) { setErr(e?.message || t('That could not be done.')) }
  }
  const routine = made?.routine
  return <div className={'ca' + (applied ? ' done' : '')}>
    <div className="ca-h"><span className="ca-i"><Icon name={d.icon} /></span><b>{d.title}</b></div>
    {d.lines.length > 0 && <ul className="ca-lines">{d.lines.slice(0, 15).map((l, i) => <li key={i}>{l}</li>)}</ul>}
    {err && <div className="ca-err small">{err}</div>}
    <div className="ca-acts">
      {applied
        ? <span className="ca-ok"><Icon name="checkCircle" />{t('Applied')}</span>
        : <button className="btn primary sm" onClick={apply}><Icon name="check" /><span>{t('Apply')}</span></button>}
      {routine && <button className="btn tinted sm" onClick={() => { useUI.getState().closeAll(); nav('/plan/r/' + routine) }}><span>{t('Open routine')}</span></button>}
    </div>
  </div>
}

/** The proposed changes of one message; `applied` the indexes already applied. */
export default function CoachActions({ actions, applied = [], onApplied }) {
  if (!actions?.length) return null
  return <div className="ca-list">
    <div className="ca-k small"><Icon name="sparkles" />{t('Proposed changes: nothing changes until you apply them.')}</div>
    {actions.map((a, i) => <Card key={i} a={a} applied={applied.includes(i)} onApplied={() => onApplied?.(i)} />)}
  </div>
}
