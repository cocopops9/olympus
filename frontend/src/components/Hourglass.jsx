// Olympus: the workout clock's hourglass. The sand runs from the top bulb to the bottom one, then
// the glass turns over and it starts again; a paused clock holds the sand where it is, and with
// reduced motion the glass stands still. Drawn in the app's gold with currentColor for the frame.
export default function Hourglass({ paused = false, size = 26 }) {
  return <svg className={'hglass' + (paused ? ' paused' : '')} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <g className="hglass-turn">
      <path d="M6 3h12M6 21h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M7.5 3.6c0 3.4 2.2 5.4 4.5 8.4-2.3 3-4.5 5-4.5 8.4M16.5 3.6c0 3.4-2.2 5.4-4.5 8.4 2.3 3 4.5 5 4.5 8.4"
        stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      <clipPath id="hglass-top"><path d="M8.3 4.4h7.4c-.4 2.6-2 4.3-3.7 6.6-1.7-2.3-3.3-4-3.7-6.6Z" /></clipPath>
      <clipPath id="hglass-bot"><path d="M8.3 19.6h7.4c-.4-2.6-2-4.3-3.7-6.6-1.7 2.3-3.3 4-3.7 6.6Z" /></clipPath>
      <rect className="hglass-sand top" x="7" y="4" width="10" height="7.2" clipPath="url(#hglass-top)" />
      <rect className="hglass-sand bot" x="7" y="12.8" width="10" height="7.2" clipPath="url(#hglass-bot)" />
      <line className="hglass-stream" x1="12" y1="11.4" x2="12" y2="19.2" />
    </g>
  </svg>
}
