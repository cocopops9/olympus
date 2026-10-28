// Olympus: the small pieces of the guide (lib/guide.js) that screens put on themselves.
//   <Tip>        a one-time card at the top of a screen, saying what the screen is for
//   <InfoButton> the ⓘ next to a heading, opening helpSheet()
//   helpSheet()  a plain explanation first, and the technical one folded away under it
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { tipVisible, withTipSeen, withGuideLevel } from '../lib/guide.js'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import '../guide.css'

/**
 * A one-time tip. Shows until "Got it"; "No more tips" switches the whole guide off (it can be
 * switched back on in Settings → About & updates, which the tip says).
 */
export function Tip({ id, title, icon = 'lightbulb', children }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  if (!tipVisible(S, id)) return null
  const seen = () => update(s => { s.hints = withTipSeen(s.hints, id) })
  const off = () => {
    update(s => { s.hints = withGuideLevel(withTipSeen(s.hints, id), 'off') })
    useUI.getState().toast(t('Tips are off. Turn them back on in Settings → About & updates.'))
  }
  return <div className="card guide-tip" role="note" data-tip={id}>
    <div className="guide-tip-h"><span className="guide-tip-i" aria-hidden="true"><Icon name={icon} /></span><b>{title}</b></div>
    <div className="small guide-tip-b">{children}</div>
    <div className="guide-tip-a">
      <Button size="sm" variant="tinted" onClick={seen}>{t('Got it')}</Button>
      <Button size="sm" variant="ghost" className="dim" onClick={off}>{t('No more tips')}</Button>
    </div>
  </div>
}

/**
 * What a card or a screen shows, in two layers: `simple` for everyone (a string or a list of
 * paragraphs), `expert` folded under "Technical details" for whoever wants the method.
 */
export function helpSheet({ title, simple, expert }) {
  const paras = v => (Array.isArray(v) ? v : v ? [v] : [])
  useUI.getState().openSheet(close => <div className="guide-help">
    <h3>{title}</h3>
    {paras(simple).map((p, i) => <p key={i} className="guide-help-p">{p}</p>)}
    {paras(expert).length > 0 && <details className="guide-help-x">
      <summary>{t('Technical details')}</summary>
      {paras(expert).map((p, i) => <p key={i} className="small muted">{p}</p>)}
    </details>}
    <Button variant="primary" onClick={close}>{t('Done')}</Button>
  </div>)
}

/** The ⓘ beside a heading. `label` names what it explains, for a screen reader. */
export function InfoButton({ label, onClick }) {
  return <button type="button" className="guide-info" onClick={onClick}
    aria-label={label ? t('What is {0}?', label) : t('What is this?')}>
    <Icon name="info" />
  </button>
}
