// Olympus: the moving icons of Profile's Training rows, drawn on the same 24×24 grid and stroke as
// components/Icon.jsx so they sit next to the others: today's date on a calendar, a barbell
// being pressed, a calendar whose page flips, a turning gear, and the pulse of Body & wellbeing.
// The motion is slow and short, and stops for anyone who asks for reduced motion (index.css).
import Icon from './Icon.jsx'
import '../live-icons.css'

/** A calendar showing the day of the month of `date` (today by default). */
export function CalendarDayIcon({ date = new Date() }) {
  const day = date.getDate()
  return <svg className="icn live-cal" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="3.2" y="4.4" width="17.6" height="16.6" rx="3" />
    <path className="live-cal-top" d="M3.2 9V7.4a3 3 0 0 1 3-3h11.6a3 3 0 0 1 3 3V9Z" />
    <path d="M8 2.8v3M16 2.8v3" />
    <text x="12" y="19.1" textAnchor="middle" className="live-cal-n">{day}</text>
  </svg>
}

/** A barbell, pressed up and lowered again every few seconds. */
export function BarbellIcon() {
  return <svg className="icn live-bar" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <g className="live-bar-lift">
      <path d="M2.9 12h18.2M7.4 7.4v9.2M9.8 9.3v5.4M16.6 7.4v9.2M14.2 9.3v5.4" />
    </g>
    <path className="live-bar-floor" d="M6 21h12" />
  </svg>
}

/** A calendar whose top page turns over every few seconds. */
export function FlipCalendarIcon() {
  return <svg className="icn live-flip" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="3.4" y="5.2" width="17.2" height="15.4" rx="3.2" />
    <path d="M8.2 3.4v3.4M15.8 3.4v3.4M3.4 10.2h17.2" />
    <path d="M7.5 14h2M11 14h2M14.5 14h2M7.5 17.2h2M11 17.2h2" />
    <g className="live-flip-page">
      <path d="M3.4 10.2h17.2v7.2a3.2 3.2 0 0 1-3.2 3.2H6.6a3.2 3.2 0 0 1-3.2-3.2Z" />
    </g>
  </svg>
}

/** The settings gear, turning slowly. */
export function SpinningGearIcon() {
  return <Icon name="gear" className="live-gear" />
}

/** A heart with a pulse line: how the body is doing, not what it weighs. */
export function PulseIcon() {
  return <svg className="icn live-pulse" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 20.2s-7.6-4.6-8.6-10A4.6 4.6 0 0 1 12 7.1a4.6 4.6 0 0 1 8.6 3.1c-1 5.4-8.6 10-8.6 10Z" />
    <path className="live-pulse-line" d="M5.2 12.6h3.6l1.4-2.6 2.2 4.8 1.6-3.2 1.2 1h3.6" />
  </svg>
}
