// Olympus: a set's best as a card shows it: "30 kg × 16 reps" with the numbers in front and the
// units small behind them, instead of the bare "30×16" the plain-text history prints. Any label
// that is not weight×reps (time, cardio, bodyweight) reads as it always did (lib/set-label-parts.js).
import { t } from '../lib/i18n.js'
import { setLabelParts, isPlainPair } from '../lib/set-label-parts.js'

export default function SetValue({ label, unit = 'kg', className = '' }) {
  const parts = setLabelParts(label)
  const plain = isPlainPair(parts)
  return <span className={('setv ' + className).trim()}>
    {parts.map((p, i) => (p.w == null
      ? <span key={i}>{p.text}</span>
      : <span key={i} className="setv-p">
        <b>{p.w}</b><small>{unit}</small><i aria-hidden="true">×</i><b>{p.r}</b>{plain && <small>{t('reps')}</small>}
      </span>))}
  </span>
}
