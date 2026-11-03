// Olympus: the workout clock's stopwatch. A thin hand sweeps round the dial once every ten seconds
// while the workout runs; a paused clock holds the hand where it is, and with reduced motion it
// stands still. Drawn in the app's accent with currentColor for the case.
export default function Stopwatch({ paused = false, size = 26 }) {
  return <svg className={'swatch' + (paused ? ' paused' : '')} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13.5" r="7.4" />
      <path d="M9.6 3.2h4.8M12 3.2v2.9M18.2 7.1l1.5-1.5" />
      <path className="swatch-ticks" d="M12 8.1v.9M12 18v.9M6.6 13.5h.9M16.5 13.5h.9" strokeWidth="1.3" />
    </g>
    <g className="swatch-hand">
      <path d="M12 13.5V8.9" stroke="var(--acc)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="13.5" r="1.3" fill="var(--acc)" />
    </g>
  </svg>
}
