// Olympus: body weight, measurements and progress photos, on a page of their own. Opened from
// Profile (Body tracking); none of it is on the front screens, and there are no weight goals:
// the app records, it does not push a number.
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { Section, Row } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import Measurements from './Measurements.jsx'
import { BodyWeightCard } from './Home.jsx'

export default function BodyTracking() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/profile')} aria-label={t('Profile')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 10 }}><h1>{t('Body tracking')}</h1><div className="sub">{t('Weight, measurements and photos')}</div></div>
    </div>
    <BodyWeightCard S={S} />
    <Measurements embedded />
    <Section>
      <Row icon="camera" iconTint="var(--pink)" title={t('Progress photos')} accessory="chevron" onClick={() => nav('/progress-photos')} />
    </Section>
  </div>
}
