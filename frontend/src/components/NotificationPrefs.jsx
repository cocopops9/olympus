// Settings → Notifications: which kinds of social news you are told about, and the sound a
// notification makes. The reminders above them are views/Settings.jsx NotificationsCard.
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { NEWS_KINDS, NOTIFY_SOUND_IDS, newsOn, notifySoundOf, setNewsKind } from '../lib/notify-sounds.js'
import { notifySound, unlock } from '../lib/sound.js'
import { Section, Row, Switch, Button } from './ui.jsx'

export const NEWS_LABEL = { like: 'Likes', comment: 'Comments', follow: 'New followers', request: 'Follow requests', accepted: 'Accepted requests' }
const NEWS_ICON = { like: ['heart', 'var(--red)'], comment: ['chat', 'var(--blue)'], follow: ['person', 'var(--green)'], request: ['lock', 'var(--indigo)'], accepted: ['checkCircle', 'var(--teal)'] }

export const NOTIFY_SOUND_LABEL = { kymbala: 'Cymbals and lyre', tetrachord: 'Lyre tetrachord', system: 'Phone default', off: 'Silent' }
const NOTIFY_SOUND_HINT = {
  kymbala: 'Small bronze cymbals, then a lyre calls, as at a Greek feast.',
  tetrachord: 'A lyre plucks the Dorian tetrachord, A G F E, the scale Greek music was built on.',
  system: 'The sound your phone uses for notifications.',
  off: 'No sound. The notification still shows.',
}

export function NewsKindsSection({ S, update }) {
  return <Section title={t('What you hear about')}
    footer={t('A kind switched off is not listed, not counted on the badge and not sent as a push notification.')}>
    {NEWS_KINDS.map(kind => <Row key={kind} icon={NEWS_ICON[kind][0]} iconTint={NEWS_ICON[kind][1]} title={t(NEWS_LABEL[kind])}>
      <Switch checked={newsOn(S, kind)} onChange={v => update(s => setNewsKind(s, kind, v))} aria-label={t(NEWS_LABEL[kind])} />
    </Row>)}
  </Section>
}

export function pickNotifySound(id) {
  unlock(true)
  useStore.getState().update(s => { s.notifySound = id })
  notifySound(id)
}

export function NotifySoundSheet({ close }) {
  const S = useStore(s => s.S)
  const cur = notifySoundOf(S)
  return <>
    <h3>{t('Notification sound')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Tap one to hear it.')}</div>
    <Section>
      {NOTIFY_SOUND_IDS.map(id => <Row key={id} icon={id === cur ? 'speaker' : id === 'off' ? 'bellSlash' : 'play'} iconTint="var(--pink)"
        title={t(NOTIFY_SOUND_LABEL[id])} subtitle={t(NOTIFY_SOUND_HINT[id])} accessory={id === cur ? 'check' : 'none'}
        onClick={() => pickNotifySound(id)} />)}
    </Section>
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={close}>{t('Done')}</Button>
  </>
}
export const notifySoundSheet = () => useUI.getState().openSheet(close => <NotifySoundSheet close={close} />)

export function NotifySoundSection({ S, social }) {
  const nav = useNavigate()
  return <Section footer={social
    ? t('Plays for workout reminders and, while Olympus is open, for new likes, comments, followers and messages.')
    : t('Plays for workout reminders.')}>
    <Row icon="bell" iconTint="var(--pink)" title={t('Notification sound')} value={t(NOTIFY_SOUND_LABEL[notifySoundOf(S)])}
      accessory="chevron" onClick={notifySoundSheet} />
    <Row icon="timer" iconTint="var(--orange)" title={t('Timer alerts')} accessory="chevron" onClick={() => nav('/settings/alerts')} />
  </Section>
}
