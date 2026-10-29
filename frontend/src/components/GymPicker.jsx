// Olympus: the gym of a saved workout (lib/gyms.js). In the finish summary and in a workout's
// detail. A finished workout arrives with the gym of the latest workout already picked
// (sheets.jsx doFinishWorkout). With one gym it is a chip; with two or more, a drop-down. The +
// adds a gym, the pencil renames the one picked or deletes it from every workout.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { gymsOf, setWorkoutGym, cleanGym, renameGym, deleteGym, gymUseCount, GYM_MAX } from '../lib/gyms.js'
import { sameWorkout } from '../lib/workout-date.js'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import '../gym-picker.css'

const NONE = ''
const update = fn => useStore.getState().update(fn)
const toast = m => useUI.getState().toast(m)

// One field and a Save, for a new name. `initial` is the current name when renaming.
function NameSheet({ title, initial = '', saveLabel, onSave, close }) {
  const [name, setName] = useState(initial)
  const ok = !!cleanGym(name) && cleanGym(name) !== cleanGym(initial)
  const save = () => { if (!ok) return; close(); onSave(cleanGym(name)) }
  return <form onSubmit={e => { e.preventDefault(); save() }}>
    <h3>{title}</h3>
    <input className="field" autoFocus maxLength={GYM_MAX} value={name} placeholder={t('Gym name')}
      aria-label={t('Gym name')} onChange={e => setName(e.target.value)} />
    <div style={{ height: 12 }} />
    <Button variant="primary" type="submit" disabled={!ok}>{saveLabel}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" type="button" onClick={close}>{t('Cancel')}</Button>
  </form>
}
const nameSheet = opts => useUI.getState().openSheet(close => <NameSheet {...opts} close={close} />)

function ManageSheet({ gym, onRenamed, onDeleted, close }) {
  const count = gymUseCount(useStore.getState().S, gym)
  const [asking, setAsking] = useState(false)
  const rename = () => {
    close()
    nameSheet({
      title: t('Rename gym'), initial: gym, saveLabel: t('Rename'),
      onSave: to => {
        let n = 0
        update(s => { n = renameGym(s, gym, to) })
        toast(tn('Renamed on {0} workout', 'Renamed on {0} workouts', n))
        onRenamed?.(to)
      },
    })
  }
  const remove = () => {
    let n = 0
    update(s => { n = deleteGym(s, gym) })
    close()
    toast(tn('Gym removed from {0} workout', 'Gym removed from {0} workouts', n))
    onDeleted?.()
  }
  return <div>
    <h3 style={{ marginBottom: 2 }}>{gym}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{tn('On {0} workout', 'On {0} workouts', count)}</div>
    {asking ? <>
      <p className="muted" style={{ lineHeight: 1.5 }}>{t('The gym is taken off every workout that has it. The workouts themselves stay.')}</p>
      <button className="btn danger" onClick={remove}>{t('Delete gym')}</button>
      <div style={{ height: 8 }} />
      <Button variant="ghost" className="dim" onClick={() => setAsking(false)}>{t('Cancel')}</Button>
    </> : <div className="list menu-list">
      <div className="item menu-item" role="button" tabIndex={0} onClick={rename}>
        <span className="lrow-i"><Icon name="pencil" /></span><div className="grow"><div className="tt">{t('Rename gym')}</div></div>
      </div>
      <div className="item menu-item danger" role="button" tabIndex={0} onClick={() => setAsking(true)}>
        <span className="lrow-i"><Icon name="trash" /></span><div className="grow"><div className="tt">{t('Delete gym')}</div></div>
      </div>
    </div>}
  </div>
}

export default function GymPicker({ w }) {
  const S = useStore(s => s.S)
  const rec = S.workouts.find(x => sameWorkout(x, w)) || w
  const cur = cleanGym(rec.gym)
  const gyms = gymsOf(S)
  const set = g => update(s => setWorkoutGym(s, rec, g))
  const add = () => nameSheet({ title: t('Add a gym'), saveLabel: t('Add'), onSave: set })
  const manage = () => cur && useUI.getState().openSheet(close => <ManageSheet gym={cur} close={close} />)

  return <div className="gym">
    <div className="gym-h"><Icon name="pin" /><span>{t('Gym')}</span><span className="dim small">{t('optional')}</span></div>
    {!gyms.length && <p className="small dim gym-why">{t('Machines can be set up differently in each gym: with a gym on your workouts, progress can be seen per gym.')}</p>}
    <div className="gym-row">
      {gyms.length >= 2 ? <label className="gym-select">
        <select aria-label={t('Gym')} value={cur} onChange={e => set(e.target.value)}>
          <option value={NONE}>{t('No gym')}</option>
          {gyms.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <Icon name="chevronDown" />
      </label> : gyms.length === 1
        ? <button className={'chip nocap gym-one' + (cur === gyms[0] ? ' on' : '')} aria-pressed={cur === gyms[0]}
          onClick={() => set(cur === gyms[0] ? NONE : gyms[0])}>{gyms[0]}</button>
        : <button className="chip nocap gym-add" onClick={add}><Icon name="plus" /> {t('Add the gym')}</button>}
      {gyms.length > 0 && <>
        <button className="iconbtn gym-btn" onClick={add} aria-label={t('Add a gym')} title={t('Add a gym')}><Icon name="plus" /></button>
        <button className="iconbtn gym-btn" onClick={manage} disabled={!cur} aria-label={t('Rename or delete this gym')} title={t('Rename or delete this gym')}><Icon name="pencil" /></button>
      </>}
    </div>
  </div>
}
