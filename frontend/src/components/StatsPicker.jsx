// Olympus: choosing the statistics on the Stats page (lib/stats-cards.js). The cards on the page
// come first, in their order, with arrows to move them and a switch to take one off; below, the
// ones left out, as tiles to tap in. Every change shows on the page at once and syncs with the
// profile; "Default" goes back to the short starting set.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { STATS_CARDS, statsCard, statsCardsOf, toggleCard, moveCard } from '../lib/stats-cards.js'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import '../stats-picker.css'


function Glyph({ card }) {
  return <span className={'sp-glyph tone-' + card.tone} aria-hidden="true"><Icon name={card.icon} /></span>
}

function Picker({ close }) {
  const S = useStore(s => s.S)
  const shown = statsCardsOf(S)
  const hidden = STATS_CARDS.filter(c => !shown.includes(c.id))
  const [moved, setMoved] = useState(null)
  const save = list => useStore.getState().update(s => { s.statsCards = list })
  const move = (from, to) => { save(moveCard(shown, from, to)); setMoved(shown[from]) }

  return <div className="sp">
    <h3 style={{ marginBottom: 4 }}>{t('Your statistics')}</h3>
    <p className="small muted" style={{ marginTop: 0 }}>{t('Pick what the Stats page shows, and in which order. Nothing is lost: a card you hide keeps counting and comes back as it was.')}</p>

    <div className="sp-sec">{t('On your page')} <span className="dim">{shown.length}</span></div>
    {shown.length ? <div className="sp-list">
      {shown.map((id, i) => {
        const c = statsCard(id)
        return <div key={id} className={'sp-row' + (moved === id ? ' moved' : '')} onAnimationEnd={() => setMoved(null)}>
          <Glyph card={c} />
          <div className="sp-txt"><div className="sp-name">{c.name()}</div><div className="sp-desc">{c.desc()}</div></div>
          <div className="sp-move">
            <button className="sp-arrow" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={t('Move {0} up', c.name())}><Icon name="chevronUp" /></button>
            <button className="sp-arrow" disabled={i === shown.length - 1} onClick={() => move(i, i + 1)} aria-label={t('Move {0} down', c.name())}><Icon name="chevronDown" /></button>
          </div>
          <button className="sp-switch on" role="switch" aria-checked="true" onClick={() => save(toggleCard(shown, id))} aria-label={t('Hide {0}', c.name())}><i /></button>
        </div>
      })}
    </div> : <div className="sp-empty small muted">{t('Nothing on the page yet. Tap a card below to add it.')}</div>}

    {hidden.length > 0 && <>
      <div className="sp-sec">{t('Add to the page')}</div>
      <div className="sp-grid">
        {hidden.map(c => <button key={c.id} className="sp-tile" onClick={() => save(toggleCard(shown, c.id))} aria-label={t('Show {0}', c.name())}>
          <span className="sp-plus" aria-hidden="true"><Icon name="plus" /></span>
          <Glyph card={c} />
          <span className="sp-name">{c.name()}</span>
          <span className="sp-desc">{c.desc()}</span>
        </button>)}
      </div>
    </>}

    <div className="sp-acts">
      <Button variant="ghost" icon="reset" onClick={() => save(null)} disabled={!Array.isArray(S.statsCards)}>{t('Default')}</Button>
      <Button variant="primary" onClick={close}>{t('Done')}</Button>
    </div>
  </div>
}

export const statsPickerSheet = () => useUI.getState().openSheet(close => <Picker close={close} />)

/** The button that opens the picker, for the Stats page header or its top. */
export function StatsPickerButton({ compact = false }) {
  return compact
    ? <button className="iconbtn" onClick={statsPickerSheet} aria-label={t('Choose your statistics')}><Icon name="slider" /></button>
    : <Button size="sm" variant="tinted" icon="slider" onClick={statsPickerSheet}>{t('Customize')}</Button>
}
