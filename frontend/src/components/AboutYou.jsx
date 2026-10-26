// Olympus: sex, birth date and body weight, the three things the strength levels need
// (lib/strength-level.js). Asked once, right after a new profile is made (and once on a profile
// that existed before), and editable in Settings, Account. Skipping is fine: the levels then
// say what is missing.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import { lastBW } from '../lib/history.js'
import { Button, Segmented } from './ui.jsx'
import { SEX_OPTIONS } from './AccountEdit.jsx'
import '../records.css'

const MIN_BIRTH = '1920-01-01'

/** A body weight logged for today, replacing today's if there is one. In place on `s`. */
export function logBodyWeight(s, w) {
  const iso = todayISO()
  const have = s.bodyweight.find(b => b.d === iso)
  if (have) { have.w = w; have.t = Date.now() } else s.bodyweight.push({ d: iso, w, t: Date.now() })
  s.bodyweight.sort((a, b) => (a.d < b.d ? -1 : 1))
}

function AboutYouSheet({ close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [sex, setSex] = useState(S.body === 'female' ? 'female' : 'male')
  const [birth, setBirth] = useState(S.birth || '')
  const [weight, setWeight] = useState(() => (lastBW(S)?.w ? String(lastBW(S).w) : ''))
  const unit = S.unit || 'kg'
  const w = Number(String(weight).replace(',', '.'))
  const wOk = !weight || (w > (unit === 'lb' ? 50 : 25) && w < (unit === 'lb' ? 700 : 320))
  const save = () => {
    if (!wOk) { useUI.getState().toast(t('Enter a valid weight')); return }
    update(s => {
      s.body = sex
      if (birth) s.birth = birth
      if (weight && w > 0) logBodyWeight(s, Math.round(w * 10) / 10)
      s.aboutAsked = true
    })
    close()
    useUI.getState().toast(t('Saved'))
  }
  const skip = () => { update(s => { s.aboutAsked = true }); close() }
  return <>
    <h3 style={{ marginBottom: 4 }}>{t('About you')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('Your sex, age and body weight let Olympus tell how strong you are at the main lifts: Beginner, Intermediate, Advanced or Elite. Only you see them.')}</div>
    <div className="about-f">
      <label className="small muted">{t('Sex')}</label>
      <Segmented value={sex} options={SEX_OPTIONS()} onChange={setSex} />
    </div>
    <div className="about-f">
      <label className="small muted" htmlFor="about-birth">{t('Date of birth')}</label>
      <input id="about-birth" className="input" type="date" min={MIN_BIRTH} max={todayISO()} value={birth} onChange={e => setBirth(e.target.value)} />
    </div>
    <div className="about-f">
      <label className="small muted" htmlFor="about-w">{t('Body weight ({0})', unit)}</label>
      <input id="about-w" className="input" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} placeholder={unit === 'lb' ? '160' : '72'} />
    </div>
    <Button variant="primary" onClick={save} style={{ marginTop: 6 }}>{t('Save')}</Button>
    <Button variant="ghost" onClick={skip} style={{ marginTop: 4 }}>{t('Not now')}</Button>
  </>
}

export const aboutYouSheet = () => useUI.getState().openSheet(close => <AboutYouSheet close={close} />)
