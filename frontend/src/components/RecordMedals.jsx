// Olympus: the medals of the records an exercise set (lib/records.js): a gold disc on a ribbon,
// with what the record is beside it. On the workout's exercise card and in a saved workout.
import { t } from '../lib/i18n.js'
import '../records.css'

export const recordLabel = kind => (kind === 'weight' ? t('Heaviest weight')
  : kind === 'rm' ? t('Best estimated 1RM')
    : kind === 'volume' ? t('Most volume') : kind)

/** The medal itself, sized by the font. */
export function Medal({ className = '' }) {
  return <svg className={'medal ' + className} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7.2 1.8h3.6l2.1 6.1H9.3Z" fill="#b2261c" />
    <path d="M16.8 1.8h-3.6l-2.1 6.1h3.6Z" fill="#1f4f9c" />
    <circle cx="12" cy="14.6" r="7.2" fill="#d9a21b" stroke="#7a5400" strokeWidth="1.1" />
    <circle cx="12" cy="14.6" r="5.1" fill="none" stroke="#fff3c4" strokeWidth="0.9" opacity=".85" />
    <path d="m12 11.3 1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3Z" fill="#fff3c4" />
  </svg>
}

export default function RecordMedals({ kinds, compact = false }) {
  if (!kinds?.length) return null
  return <div className={'rec-medals' + (compact ? ' compact' : '')} role="status">
    {kinds.map(k => <span key={k} className={'rec-medal rec-' + k} title={recordLabel(k)}>
      <Medal />{!compact && <span>{recordLabel(k)}</span>}
    </span>)}
  </div>
}
