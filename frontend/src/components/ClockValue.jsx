// The duration of a cardio set, shown as what it is (30, or 30:16, or 1:30:16) and edited in a
// small sheet with hours, minutes and seconds. The stored number stays minutes (lib/cardio-time.js),
// so a whole number of minutes still reads and saves exactly as before.
//
//   <ClockValue value={set.min} onChange={min => …} title={t('Duration')} />
//   clockSheet({ title, value, onDone: min => … })
import { useState } from 'react'
import { t } from '../lib/i18n.js'
import { useUI } from '../store/useUI.js'
import { secsOfMin, minOfSecs, splitHms, joinHms, fmtClock, isWholeMinutes } from '../lib/cardio-time.js'
import { Button, NumberField } from './ui.jsx'

// What the cell shows: the plain number for whole minutes (the column says "min"), the clock otherwise.
export const clockShown = min => (isWholeMinutes(min) ? String(Number(min) || 0) : fmtClock(min))

function ClockSheet({ title, value, onDone, close }) {
  const start = splitHms(secsOfMin(value))
  const [h, setH] = useState(start.h)
  const [m, setM] = useState(start.m)
  const [s, setS] = useState(start.s)
  const total = joinHms(h, m, s)
  const done = () => { close(); onDone(minOfSecs(total)) }
  const field = (label, v, set, ariaLabel) => (
    <label className="clk-f">
      <span className="clk-l">{label}</span>
      <NumberField value={v} decimal={false} onChange={set} aria-label={ariaLabel}
        onKeyDown={e => { if (e.key === 'Enter') done() }} />
    </label>
  )
  return <>
    <h3>{title}</h3>
    <div className="dw-read" aria-live="polite">{fmtClock(minOfSecs(total))}</div>
    <div className="clk-row" dir="ltr">
      {field(t('Hours'), h, setH, t('Hours'))}
      {field(t('Minutes'), m, setM, t('Minutes'))}
      {field(t('Seconds'), s, setS, t('Seconds'))}
    </div>
    <p className="dim small dw-foot">{t('Type any mix, such as 90 minutes or 75 seconds: it is carried over.')}</p>
    <Button variant="primary" onClick={done}>{t('Done')}</Button>
    <div style={{ height: 8 }} />
  </>
}

export const clockSheet = ({ title, value, onDone }) =>
  useUI.getState().openSheet(close => <ClockSheet title={title} value={value} onDone={onDone} close={close} />)

export default function ClockValue({ value, onChange, title, disabled = false, className = '' }) {
  return <button type="button" className={'num clk-val ' + className} disabled={disabled}
    aria-label={title + ': ' + fmtClock(value)}
    onClick={() => clockSheet({ title, value, onDone: onChange })}>{clockShown(value)}</button>
}
