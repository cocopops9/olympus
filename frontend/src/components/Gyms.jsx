// Olympus: gyms with a face (lib/gyms.js). Each gym has a picture: one of the drawings of Mount
// Olympus that come with the app, or a photo the person took of the place. The session in
// progress has its gym picked at the top of the workout (views/Workout.jsx), and records can be
// kept per gym (Settings → Workout → Gyms), since the same machine reads differently in two gyms.
//
//   <GymIcon name="McFit" size={28} />
//   gymChooserSheet({ current, onPick })      the list, with "No gym" and "Add a gym"
//   gymEditSheet({ name, onSaved })           name and picture, new or existing
import { useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { gymsOf, gymMeta, saveGym, cleanGym, renameGym, deleteGym, gymUseCount, GYM_ICONS, GYM_MAX } from '../lib/gyms.js'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import temple from '../assets/gyms/temple.webp'
import gymnasium from '../assets/gyms/gymnasium.webp'
import palace from '../assets/gyms/palace.webp'
import stadium from '../assets/gyms/stadium.webp'
import forge from '../assets/gyms/forge.webp'
import home from '../assets/gyms/home.webp'
import '../gym-picker.css'

export const GYM_ART = { temple, gymnasium, palace, stadium, forge, home }
const ICON_LABEL = {
  temple: 'Temple on the summit', gymnasium: 'Gymnasium', palace: 'Palace of Zeus',
  stadium: 'Stadium', forge: 'Forge of Hephaestus', home: 'House with a dumbbell',
}

const update = fn => useStore.getState().update(fn)
const toast = m => useUI.getState().toast(m)
const openSheet = (render, opts) => useUI.getState().openSheet(render, opts)

/** A gym's picture, round: its photo, or its drawing. No name: a plain pin. */
export function GymIcon({ name, size = 28, className = '' }) {
  const S = useStore(s => s.S)
  const g = cleanGym(name)
  if (!g) return <span className={'gym-ic gym-ic-none ' + className} style={{ width: size, height: size }} aria-hidden="true"><Icon name="pin" /></span>
  const { icon, photo } = gymMeta(S, g)
  return <img className={'gym-ic ' + className} src={photo || GYM_ART[icon]} width={size} height={size} alt="" aria-hidden="true" />
}

// A photo picked or taken, as a small square JPEG: the middle of it, 160 px a side.
export async function squarePhoto(file, side = 160) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url })
    const s = Math.min(img.naturalWidth, img.naturalHeight)
    const c = document.createElement('canvas')
    c.width = c.height = side
    c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, side, side)
    return c.toDataURL('image/jpeg', 0.72)
  } finally { URL.revokeObjectURL(url) }
}

function GymEditSheet({ name = '', onSaved, close }) {
  const S = useStore(s => s.S)
  const isNew = !cleanGym(name)
  const start = isNew ? { icon: GYM_ICONS[0], photo: null } : gymMeta(S, name)
  const [label, setLabel] = useState(name)
  const [icon, setIcon] = useState(start.icon)
  const [photo, setPhoto] = useState(start.photo)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const file = useRef(null)
  const clean = cleanGym(label)
  const taken = clean && clean !== cleanGym(name) && gymsOf(S).includes(clean)
  const ok = !!clean
  const pick = async e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    try { setPhoto(await squarePhoto(f)) } catch { toast(t('That picture could not be read.')) } finally { setBusy(false) }
  }
  const save = () => {
    if (!ok) return
    let n = 0
    update(s => {
      if (!isNew && clean !== cleanGym(name)) n = renameGym(s, name, clean)
      saveGym(s, clean, { icon, photo: photo || null })
    })
    if (n) toast(tn('Renamed on {0} workout', 'Renamed on {0} workouts', n))
    close()
    onSaved?.(clean)
  }
  const remove = () => {
    let n = 0
    update(s => { n = deleteGym(s, name) })
    close()
    toast(tn('Gym removed from {0} workout', 'Gym removed from {0} workouts', n))
  }
  if (asking) return <div>
    <h3>{t('Delete gym')}</h3>
    <p className="muted" style={{ lineHeight: 1.5 }}>{t('The gym is taken off every workout that has it. The workouts themselves stay.')}</p>
    <button className="btn danger" onClick={remove}>{t('Delete gym')}</button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={() => setAsking(false)}>{t('Cancel')}</Button>
  </div>
  return <form onSubmit={e => { e.preventDefault(); save() }}>
    <h3>{isNew ? t('Add a gym') : t('Edit gym')}</h3>
    <div className="gym-ed-top">
      <img className="gym-ic gym-ed-prev" src={photo || GYM_ART[icon]} width={72} height={72} alt="" />
      <input className="field" autoFocus={isNew} maxLength={GYM_MAX} value={label} placeholder={t('Gym name')}
        aria-label={t('Gym name')} onChange={e => setLabel(e.target.value)} />
    </div>
    {taken && <p className="small muted">{t('A gym with this name exists: the two become one.')}</p>}
    <div className="gym-ed-l small muted">{t('Picture')}</div>
    <div className="gym-ed-grid" role="radiogroup" aria-label={t('Picture')}>
      {GYM_ICONS.map(k => <button type="button" key={k} role="radio" aria-checked={!photo && icon === k} aria-label={t(ICON_LABEL[k])}
        className={'gym-ed-opt' + (!photo && icon === k ? ' on' : '')} onClick={() => { setIcon(k); setPhoto(null) }}>
        <img src={GYM_ART[k]} alt="" width={56} height={56} />
      </button>)}
      <button type="button" role="radio" aria-checked={!!photo} className={'gym-ed-opt gym-ed-photo' + (photo ? ' on' : '')}
        aria-label={t('Your photo')} disabled={busy} onClick={() => file.current?.click()}>
        {photo ? <img src={photo} alt="" width={56} height={56} /> : <span className="gym-ed-cam"><Icon name="camera" /></span>}
        <small>{busy ? '…' : t('Your photo')}</small>
      </button>
    </div>
    <input ref={file} type="file" accept="image/*" hidden onChange={pick} />
    <p className="small dim" style={{ margin: '4px 0 12px' }}>{t('A photo of the building works well: it is kept small, square, with your gyms.')}</p>
    <Button variant="primary" type="submit" disabled={!ok || busy}>{t('Save')}</Button>
    <div style={{ height: 8 }} />
    {!isNew && <><Button variant="ghost" type="button" icon="trash" style={{ color: 'var(--red)' }} onClick={() => setAsking(true)}>{t('Delete gym')}</Button><div style={{ height: 4 }} /></>}
    <Button variant="ghost" className="dim" type="button" onClick={close}>{t('Cancel')}</Button>
  </form>
}
export const gymEditSheet = ({ name = '', onSaved } = {}) => openSheet(close => <GymEditSheet name={name} onSaved={onSaved} close={close} />)

function GymChooser({ current, onPick, close }) {
  const S = useStore(s => s.S)
  const gyms = gymsOf(S)
  const cur = cleanGym(current)
  const choose = g => { close(); onPick(g) }
  return <div>
    <h3 style={{ marginBottom: 4 }}>{t('Where are you training?')}</h3>
    <p className="small muted" style={{ marginTop: 0 }}>{S.recordsByGym
      ? t('Records are kept per gym: this workout is held only against the ones in the same gym.')
      : t('Machines can be set up differently in each gym: with a gym on your workouts, progress can be seen per gym.')}</p>
    <div className="list menu-list gym-list">
      {gyms.map(g => <div key={g} className={'item menu-item gym-li' + (g === cur ? ' on' : '')} role="button" tabIndex={0} onClick={() => choose(g)}
        onKeyDown={e => { if (e.key === 'Enter') choose(g) }}>
        <GymIcon name={g} size={40} />
        <div className="grow"><div className="tt">{g}</div><div className="small muted">{tn('{0} workout', '{0} workouts', gymUseCount(S, g))}</div></div>
        {g === cur && <Icon name="check" className="gym-li-k" />}
        <button type="button" className="iconbtn gym-li-e" aria-label={t('Edit gym')} title={t('Edit gym')}
          onClick={e => { e.stopPropagation(); gymEditSheet({ name: g }) }}><Icon name="pencil" /></button>
      </div>)}
      <div className={'item menu-item gym-li' + (!cur ? ' on' : '')} role="button" tabIndex={0} onClick={() => choose('')}>
        <GymIcon name="" size={40} />
        <div className="grow"><div className="tt">{t('No gym')}</div><div className="small muted">{t('Counts for every gym')}</div></div>
        {!cur && <Icon name="check" className="gym-li-k" />}
      </div>
    </div>
    <div style={{ height: 10 }} />
    <Button variant="tinted" icon="plus" onClick={() => { close(); gymEditSheet({ onSaved: g => onPick(g) }) }}>{t('Add a gym')}</Button>
  </div>
}
export const gymChooserSheet = ({ current, onPick }) => openSheet(close => <GymChooser current={current} onPick={onPick} close={close} />)

/** Settings: every gym, to rename, re-picture or delete, and one to add. */
export function GymsManager() {
  const S = useStore(s => s.S)
  const gyms = gymsOf(S)
  return <div className="list gym-list">
    {gyms.map(g => <div key={g} className="item menu-item gym-li" role="button" tabIndex={0} onClick={() => gymEditSheet({ name: g })}>
      <GymIcon name={g} size={36} />
      <div className="grow"><div className="tt">{g}</div><div className="small muted">{tn('{0} workout', '{0} workouts', gymUseCount(S, g))}</div></div>
      <Icon name="chevronRight" className="lrow-c" />
    </div>)}
    <div className="item menu-item gym-li gym-add-li" role="button" tabIndex={0} onClick={() => gymEditSheet()}>
      <span className="gym-ic gym-ic-none" style={{ width: 36, height: 36 }}><Icon name="plus" /></span>
      <div className="grow"><div className="tt">{t('Add a gym')}</div></div>
    </div>
  </div>
}
