// Olympus: "How you feel", the daily check-in at the top of the Body page (lib/feel.js). Three
// rows of five faces, from a sad red one to a smiling green one, tap to answer and tap again to
// clear; under them the last two weeks, one column a day, so a run of poor sleep or heavy soreness
// is visible next to the training. Every row runs from worse on the left to better on the right:
// for soreness that is "very sore" to "none", though the stored value keeps 5 = very sore.
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { todayISO, fmtDate } from '../lib/format.js'
import { FEEL_FIELDS, feelOn, setFeel, recentFeel, goodness } from '../lib/feel.js'
import Icon from './Icon.jsx'

// The mouth of each face, worst to best: a deep frown, a slight one, a straight line, a slight
// smile, a wide open smile.
const MOUTHS = {
  1: 'M8.2 17.2c1.9-2.6 5.7-2.6 7.6 0',
  2: 'M8.6 16.4c1.7-1.3 5.1-1.3 6.8 0',
  3: 'M8.7 15.6h6.6',
  4: 'M8.6 14.6c1.7 1.5 5.1 1.5 6.8 0',
  5: 'M7.9 13.6c.6 3.6 7.6 3.6 8.2 0Z',
}

/** A face for goodness `g` (1 to 5), drawn in the currentColor of its step. */
export function FeelFace({ g }) {
  return <svg className="feel-face" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10.4" fill="currentColor" />
    {g === 1 ? <>
      <path d="M7.1 9.3l2.7-1.2M16.9 9.3l-2.7-1.2" stroke="#1a0a0a" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="11.2" r="1.25" fill="#1a0a0a" /><circle cx="15" cy="11.2" r="1.25" fill="#1a0a0a" />
    </> : g === 5 ? <>
      <path d="M7.6 10.6c.5-1.4 2.3-1.4 2.8 0M13.6 10.6c.5-1.4 2.3-1.4 2.8 0" stroke="#06200d" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </> : <>
      <circle cx="9" cy="10.4" r="1.3" fill="#1a1405" /><circle cx="15" cy="10.4" r="1.3" fill="#1a1405" />
    </>}
    <path d={MOUTHS[g]} stroke={g === 5 ? '#06200d' : '#1a1405'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      fill={g === 5 ? '#06200d' : 'none'} />
  </svg>
}

export default function FeelCard() {
  const S = useStore(s => s.S)
  const today = todayISO()
  const now = feelOn(S, today) || {}
  const days = recentFeel(S, 14, today)
  const any = days.some(d => d.feel)
  const answer = (field, v) => useStore.getState().update(s => { setFeel(s, today, field, v) })

  return <div className="card feel">
    <div className="row between" style={{ alignItems: 'baseline' }}>
      <h2 style={{ margin: 0 }}>{t('How you feel')}</h2>
      <span className="small dim">{t('Today')}</span>
    </div>
    {FEEL_FIELDS.map(f => <div key={f.id} className="feel-q" role="radiogroup" aria-label={t(f.name)}>
      <div className="feel-h"><Icon name={f.icon} /><span>{t(f.name)}</span></div>
      <div className="feel-scale">
        {(f.worseHigh ? [5, 4, 3, 2, 1] : [1, 2, 3, 4, 5]).map(v => {
          const g = goodness(f.id, v), on = now[f.id] === v
          return <button key={v} role="radio" aria-checked={on}
            className={'feel-step g' + g + (on ? ' on' : '') + (now[f.id] && !on ? ' off' : '')}
            onClick={() => answer(f.id, v)} aria-label={`${t(f.name)}: ${v} / 5`}><FeelFace g={g} /></button>
        })}
      </div>
      <div className="feel-ends small dim"><span>{t(f.worseHigh ? f.high : f.low)}</span><span>{t(f.worseHigh ? f.low : f.high)}</span></div>
    </div>)}

    {any && <div className="feel-hist" aria-label={t('The last two weeks')}>
      <div className="small dim" style={{ margin: '12px 0 6px' }}>{t('The last two weeks')}</div>
      {FEEL_FIELDS.map(f => <div key={f.id} className="feel-line">
        <Icon name={f.icon} />
        {days.map(d => {
          const v = d.feel?.[f.id]
          return <span key={d.iso} className={'feel-dot' + (v ? ' g' + goodness(f.id, v) : '')} title={fmtDate(d.iso, true) + (v ? ' · ' + v + '/5' : '')} />
        })}
      </div>)}
    </div>}
  </div>
}
