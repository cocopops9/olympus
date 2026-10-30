// Olympus: Body & wellbeing, opened from Profile. A record of how your body feels and changes,
// with no targets and no judgement: how you feel today (energy, sleep, soreness), measurements,
// progress photos and, last and only while you keep it on, body weight.
//
// Weight is deliberately not the point of this page. Tracking numbers on the body can feed an
// unhealthy relationship with food and weight for some people, so the page leads with how you
// feel, colours no change as good or bad, sets no goal weight, and lets weight be switched off
// altogether (S.bodyWeightOn): hidden, it also leaves the AI coach's summary (lib/hercules-context.js).
// Nothing logged is deleted by switching it off.
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { Section, Row, Switch } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import FeelCard from '../components/FeelCard.jsx'
import Measurements from './Measurements.jsx'
import { BodyWeightCard } from './Home.jsx'
import '../feel.css'
import { AddPhotoButtons } from './ProgressPhotos.jsx'

export default function BodyTracking() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const weightOn = S.bodyWeightOn !== false
  const setWeightOn = on => useStore.getState().update(s => { s.bodyWeightOn = on })
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/profile')} aria-label={t('Profile')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 10 }}><h1>{t('Body & wellbeing')}</h1><div className="sub">{t('How you feel, measurements and photos')}</div></div>
    </div>
    <p className="small muted body-intro">{t('A record of how your body feels and changes. Keep what helps you and switch off what does not.')}</p>
    <FeelCard />
    <Measurements embedded />
    <Section>
      <Row icon="camera" iconTint="var(--pink)" title={t('Progress photos')} accessory="chevron" onClick={() => nav('/progress-photos')} />
    </Section>
    {/* Olympus: a photo attached right here, taken now or from the gallery. */}
    <AddPhotoButtons />
    {weightOn && <BodyWeightCard S={S} />}
    <Section footer={weightOn
      ? t('Switch it off to hide body weight here and from the AI coach. Your weigh-ins stay saved.')
      : t('Body weight is hidden. Your weigh-ins stay saved, and the strength levels still use the last one.')}>
      <Row icon="scale" iconTint="var(--teal)" title={t('Body weight')} subtitle={t('Show it on this page')}>
        <Switch checked={weightOn} onChange={setWeightOn} aria-label={t('Body weight')} />
      </Row>
    </Section>
  </div>
}
