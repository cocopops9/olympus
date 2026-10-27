// Olympus: the gym of a saved workout (lib/gyms.js), as chips of the gyms already used and a
// field for a new one. In the finish summary and in a workout's detail.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { gymsOf, setWorkoutGym, cleanGym, GYM_MAX } from '../lib/gyms.js'
import { sameWorkout } from '../lib/workout-date.js'
import Icon from './Icon.jsx'
import '../gym-picker.css'

export default function GymPicker({ w }) {
  const S = useStore(s => s.S)
  const rec = S.workouts.find(x => sameWorkout(x, w)) || w
  const cur = cleanGym(rec.gym)
  const gyms = gymsOf(S)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const set = g => useStore.getState().update(s => setWorkoutGym(s, rec, g))
  const add = () => { const g = cleanGym(name); if (g) set(g); setAdding(false); setName('') }
  return <div className="gym">
    <div className="gym-h"><Icon name="pin" /><span>{t('Gym')}</span><span className="dim small">{t('optional')}</span></div>
    <p className="small dim gym-why">{t('Machines can be set up differently in each gym: with a gym on your workouts, progress can be seen per gym.')}</p>
    <div className="chips gym-chips">
      {gyms.map(g => <button key={g} className={'chip nocap' + (cur === g ? ' on' : '')} onClick={() => set(cur === g ? '' : g)}>{g}</button>)}
      {adding
        ? <form className="gym-new" onSubmit={e => { e.preventDefault(); add() }}>
          <input className="input" autoFocus maxLength={GYM_MAX} value={name} placeholder={t('Gym name')} onChange={e => setName(e.target.value)} onBlur={add} />
        </form>
        : <button className="chip nocap gym-add" onClick={() => setAdding(true)}><Icon name="plus" /> {gyms.length ? t('Another gym') : t('Add the gym')}</button>}
    </div>
  </div>
}
