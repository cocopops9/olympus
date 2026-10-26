// Olympus: "How you feel", the daily check-in at the top of the Body page (lib/feel.js). Three
// rows of five steps, tap to answer and tap again to clear; under them the last two weeks, one
// column a day, so a run of poor sleep or heavy soreness is visible next to the training.
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { todayISO, fmtDate } from '../lib/format.js'
import { FEEL_FIELDS, feelOn, setFeel, recentFeel } from '../lib/feel.js'
import Icon from './Icon.jsx'

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
        {[1, 2, 3, 4, 5].map(v => <button key={v} role="radio" aria-checked={now[f.id] === v}
          className={'feel-step s' + v + (now[f.id] === v ? ' on' : '') + (now[f.id] >= v ? ' fill' : '')}
          onClick={() => answer(f.id, v)} aria-label={`${t(f.name)}: ${v} / 5`}><i /></button>)}
      </div>
      <div className="feel-ends small dim"><span>{t(f.low)}</span><span>{t(f.high)}</span></div>
    </div>)}

    {any && <div className="feel-hist" aria-label={t('The last two weeks')}>
      <div className="small dim" style={{ margin: '12px 0 6px' }}>{t('The last two weeks')}</div>
      {FEEL_FIELDS.map(f => <div key={f.id} className="feel-line">
        <Icon name={f.icon} />
        {days.map(d => {
          const v = d.feel?.[f.id]
          return <span key={d.iso} className={'feel-dot' + (v ? ' v' + v : '')} title={fmtDate(d.iso, true) + (v ? ' · ' + v + '/5' : '')} />
        })}
      </div>)}
    </div>}
  </div>
}
