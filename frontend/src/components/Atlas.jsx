// Olympus: Atlas, the titan who holds up the sky, beside the volume lifted in a workout: the
// weight carried, in the gold medallion style of the gods' portraits (lib/god-avatars.js).
const INK = '#1a1200'
const GOLD = '#d9a21b'
const LIGHT = '#f7d466'

export default function Atlas({ size = 34, title }) {
  return <svg className="atlas" width={size} height={size} viewBox="0 0 100 100" role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'}>
    {title && <title>{title}</title>}
    <defs>
      <radialGradient id="atlas-bg" cx=".5" cy=".38" r=".7"><stop offset="0" stopColor="#fffaf0" /><stop offset="1" stopColor="#efe3c8" /></radialGradient>
    </defs>
    <circle cx="50" cy="50" r="50" fill="url(#atlas-bg)" />
    <circle cx="50" cy="50" r="45" fill="none" stroke={GOLD} strokeWidth="2.2" strokeDasharray="3 2.2" />
    <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
      {/* the celestial sphere on his shoulders */}
      <g className="atlas-sky">
        <circle cx="50" cy="31" r="19" fill={LIGHT} />
        <ellipse cx="50" cy="31" rx="8" ry="19" fill="none" strokeWidth="1.6" />
        <path d="M31.5 27h37M31.5 35h37" fill="none" strokeWidth="1.6" />
        <path d="M34 20c6 3 26 3 32 0" fill="none" strokeWidth="1.4" />
        <path d="M60 22l1.2 2.6 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4Z" fill={GOLD} strokeWidth="1" />
      </g>
      {/* the titan, kneeling under it, arms up */}
      <path d="M38 52c-3-3-5-8-4.5-12M62 52c3-3 5-8 4.5-12" fill="none" strokeWidth="5" stroke={INK} />
      <path d="M38 52c-3-3-5-8-4.5-12M62 52c3-3 5-8 4.5-12" fill="none" strokeWidth="2.6" stroke={GOLD} />
      <circle cx="50" cy="54" r="6" fill={GOLD} />
      <path d="M38 61c3-3 21-3 24 0l-3 15H41Z" fill={GOLD} />
      <path d="M44 66h12M50 63v12" fill="none" strokeWidth="1.4" />
      <path d="M41 76l-9 9 12 3M59 76l5 11" fill="none" strokeWidth="4.2" />
      <path d="M41 76l-9 9 12 3M59 76l5 11" fill="none" strokeWidth="2" stroke={LIGHT} />
    </g>
  </svg>
}
