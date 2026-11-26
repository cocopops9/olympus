// Olympus: a set's best as a card shows it, every number with the unit that says what it is:
// "30 kg × 16 reps", "+10 kg × 10 reps", "4 reps", "5 min · 12 km/h". The numbers are bold in
// front and the units small behind them; what the label holds besides (a drop arrow, a side, the
// failure mark, an effort) reads as it is written (lib/set-label-parts.js).
import { t } from '../lib/i18n.js'
import { setLabelParts, repParts } from '../lib/set-label-parts.js'

const Num = ({ v, unit }) => <><b>{v}</b>{unit && <small>{unit}</small>}</>
const Sep = ({ c }) => <i aria-hidden="true">{c}</i>

export default function SetValue({ label, unit = 'kg', className = '' }) {
  const parts = setLabelParts(label)
  // "reps" after every number of a drop set or a two-sided set would run the chip off the card;
  // with one set of reps in the label there is room for it.
  const reps = repParts(parts) === 1 ? t('reps') : null
  return <span className={('setv ' + className).trim()}>
    {parts.map((p, i) => {
      if (p.text != null) return <span key={i}>{p.text}</span>
      if (p.r != null) {
        return <span key={i} className="setv-p">
          {p.w != null && <><Num v={p.w} unit={unit} />{p.tag && <small>{p.tag.trim()}</small>}<Sep c="×" /></>}
          <Num v={p.r} unit={reps} />
        </span>
      }
      return <span key={i} className="setv-p">
        {p.min != null ? <Num v={p.min} unit="min" /> : <b>{p.clock}</b>}
        {p.load != null && <><Sep c="·" /><Num v={p.load} unit={unit} /></>}
        {p.speed != null && <><Sep c="·" /><Num v={p.speed} unit={p.su} /></>}
      </span>
    })}
  </span>
}
