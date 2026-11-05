// Olympus: the app update downloading in the background (lib/update-job.js). A slim card above the
// tab bar with the progress and a Cancel button; everything else in the app stays usable, and the
// screen can be locked: the download is Android's, it goes on regardless.
import { useUpdateJob, cancelUpdate, dismissUpdate } from '../lib/update-job.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

export default function UpdateBar() {
  const { phase, pct, error } = useUpdateJob()
  if (phase === 'idle') return null
  if (phase === 'failed') {
    return <div className="updbar bad" role="alert">
      <Icon name="download" />
      <span className="updbar-t">{t('Update failed: {0}', error || '')}</span>
      <button type="button" className="updbar-x" onClick={dismissUpdate}>{t('Close')}</button>
    </div>
  }
  const label = phase === 'verifying' ? t('Installing…') : pct != null ? t('Downloading update') + ' · ' + pct + '%' : t('Downloading update')
  return <div className="updbar" role="status">
    <Icon name="download" />
    <div className="updbar-m">
      <span className="updbar-t">{label}</span>
      <div className="upd-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
        <i className={pct == null && phase !== 'verifying' ? 'indet' : ''} style={{ width: (phase === 'verifying' ? 100 : pct ?? 30) + '%' }} />
      </div>
    </div>
    {phase === 'downloading' && <button type="button" className="updbar-x" onClick={cancelUpdate}>{t('Cancel')}</button>}
  </div>
}
