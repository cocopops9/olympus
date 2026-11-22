// The sets of one exercise in a past workout, one chip per set: the load with its unit over the
// reps with theirs, so "100 kg / 10 reps" cannot be read the wrong way round the way "100×10"
// could. lib/set-chip.js decides what each chip holds; a set that is not a rep set (cardio, a
// timed set, a set logged per side) shows the line it always had, inside the same chip.
import { t } from '../lib/i18n.js'
import { setChipOf } from '../lib/set-chip.js'

const loadUnit = (load) => (load.per === 'each' ? t('{0} each', load.unit)
  : load.per === 'total' ? t('{0} total', load.unit) : load.unit)

// What a screen reader says for a chip: "100 kg, 10 reps", not the digits run together.
function spoken(chip) {
  const part = p => [p.load ? (p.load.per === '+' ? '+' : '') + p.load.value + ' ' + loadUnit(p.load) : t('Bodyweight'), p.reps + ' ' + t('reps')].join(', ')
  return [chip.warmup ? t('Warm-up') : null, chip.parts.map(part).join(' ↘ '), chip.fail ? t('F') : null, chip.effort].filter(Boolean).join(', ')
}

function Part({ part }) {
  const { load, reps } = part
  return <span className="setchip-part">
    <span className="setchip-w">
      {load ? <>{load.per === '+' ? '+' : ''}{load.value}<small>{loadUnit(load)}</small></> : <small>{t('Bodyweight')}</small>}
    </span>
    <span className="setchip-r"><b>{reps}</b><small>{t('reps')}</small></span>
  </span>
}

export default function SetChips({ id, sets, target, unit, speedUnit }) {
  return <div className="setchips" role="list">
    {sets.map((s, i) => {
      const chip = setChipOf(id, s, target, { unit, speedUnit })
      if (chip.text != null) return <span key={i} className="setchip text" role="listitem">{chip.text}</span>
      return <span key={i} className={'setchip' + (chip.warmup ? ' warm' : '')} role="listitem" aria-label={spoken(chip)}>
        {chip.parts.map((p, j) => <span key={j} className="setchip-seg">
          {j > 0 && <span className="setchip-drop" aria-hidden="true">↘</span>}
          <Part part={p} />
        </span>)}
        {(chip.fail || chip.effort) && <span className="setchip-tags" aria-hidden="true">
          {chip.fail && <span className="setchip-f">{t('F')}</span>}
          {chip.effort && <span className="setchip-e">{chip.effort}</span>}
        </span>}
      </span>
    })}
  </div>
}
