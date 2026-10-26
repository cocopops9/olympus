// Olympus: the equipment filter as families (lib/equipment-groups.js). A tap on a family shows
// all of it; pressing and holding it, or tapping its small arrow, opens the kinds inside (for
// Barbells: barbell, EZ bar, trap bar, ...) to pick one. The chip then reads as that kind.
import { useRef } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { equipFamilies, liveEquip, groupOf } from '../lib/equipment-groups.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import Icon from './Icon.jsx'

const HOLD_MS = 450

// The families' names, written out here so the translation check finds them.
const FAMILY_LABEL = {
  barbell: () => t('Barbells'), machine: () => t('Machines'), band: () => t('Bands'),
  body: () => t('Bodyweight'), ball: () => t('Balls'), other: () => t('Other equipment'),
}
const familyLabel = f => (FAMILY_LABEL[f.id] ? FAMILY_LABEL[f.id]() : t(f.label))

function KindsSheet({ family, value, onChange, close }) {
  const pick = v => { close(); onChange(v) }
  return <>
    <h3 className="capitalize" style={{ marginBottom: 2 }}>{familyLabel(family)}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('Pick the kind you use')}</div>
    <div className="list menu-list">
      <div className={'item menu-item'} {...tappable(() => pick('g:' + family.id))}>
        <div className="grow"><div className="tt">{t('All of them')}</div></div>
        <span className="dim small">{family.count}</span>
        <span className={'menu-on' + (value === 'g:' + family.id ? ' is-on' : '')}><Icon name="check" /></span>
      </div>
      {family.variants.map(v => <div key={v.eq} className="item menu-item" {...tappable(() => pick('e:' + v.eq))}>
        <div className="grow"><div className="tt capitalize">{t(v.eq)}</div></div>
        <span className="dim small">{v.count}</span>
        <span className={'menu-on' + (value === 'e:' + v.eq ? ' is-on' : '')}><Icon name="check" /></span>
      </div>)}
    </div>
  </>
}

function FamilyChip({ family, value, onChange }) {
  const timer = useRef(null)
  const held = useRef(false)
  const start = useRef(null)
  const many = family.variants.length > 1
  const inside = value === 'g:' + family.id || (value.startsWith('e:') && groupOf(value.slice(2)) === family.id)
  const kind = value.startsWith('e:') && inside ? value.slice(2) : null
  const openKinds = () => useUI.getState().openSheet(close => <KindsSheet family={family} value={value} onChange={onChange} close={close} />)
  const cancel = () => { clearTimeout(timer.current); timer.current = null }
  const down = e => {
    held.current = false
    if (!many) return
    start.current = { x: e.clientX, y: e.clientY }
    cancel()
    timer.current = setTimeout(() => { held.current = true; timer.current = null; try { navigator.vibrate?.(15) } catch { /* no haptics */ } openKinds() }, HOLD_MS)
  }
  const move = e => {
    // A finger that moves is scrolling the strip, not holding the chip.
    if (timer.current && start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel()
  }
  const tap = () => {
    if (held.current) { held.current = false; return }
    // One kind only: the family is that kind. Tapping the chosen family again clears it.
    if (inside) onChange('')
    else onChange(many ? 'g:' + family.id : 'e:' + family.variants[0].eq)
  }
  return <button className={'chip eq-fam' + (inside ? ' on' : '')} onClick={tap}
    onPointerDown={down} onPointerMove={move} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
    onContextMenu={e => { if (many) { e.preventDefault(); cancel(); held.current = true; openKinds() } }}
    aria-label={many ? t('{0}, hold for the kinds', (kind ? t(kind) : familyLabel(family))) : undefined}>
    <span className="capitalize">{(kind ? t(kind) : familyLabel(family))}</span>
    {many && <span className="eq-more" role="button" aria-label={t('Kinds of {0}', familyLabel(family))}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); openKinds() }}><Icon name="chevronDown" /></span>}
  </button>
}

/** The family chips for `list`, with "Any equipment" first. `value` and `onChange` as in matchesEquip. */
export default function EquipChips({ list, value, onChange, stripRef, className = '', style, lead = null }) {
  const families = equipFamilies(list)
  const on = liveEquip(families, value)
  if (families.length < 2 && !(families[0]?.variants.length > 1)) return lead ? <div className={'chips ' + className} ref={stripRef} style={style}>{lead}</div> : null
  return <div className={'chips ' + className} ref={stripRef} style={style}>
    {lead}
    <button className={'chip nocap' + (!on ? ' on' : '')} onClick={() => onChange('')}>{t('Any equipment')}</button>
    {families.map(f => <FamilyChip key={f.id} family={f} value={on} onChange={onChange} />)}
  </div>
}

