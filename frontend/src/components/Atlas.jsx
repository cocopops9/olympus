// Olympus: Atlas, the titan who holds up the sky, beside the volume lifted in a workout: the
// weight carried. In the gold-and-ink style of the coaches: he kneels on one knee, arms up, the
// sky on his shoulders, a night-blue sphere with its stars and golden circles.
const INK = '#1a1200'
const GOLD = '#d9a21b'
const LIGHT = '#f7d466'
const SKIN = '#f4d9b0'
const NIGHT = '#1f2c5c'

export default function Atlas({ size = 34, title }) {
  return <svg className="atlas" width={size} height={size} viewBox="0 0 100 100" role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'}>
    {title && <title>{title}</title>}
    <defs>
      <radialGradient id="atlas-bg" cx=".5" cy=".38" r=".7"><stop offset="0" stopColor="#fffaf0" /><stop offset="1" stopColor="#efe3c8" /></radialGradient>
      <radialGradient id="atlas-sky" cx=".38" cy=".32" r=".75"><stop offset="0" stopColor="#3b4f96" /><stop offset="1" stopColor={NIGHT} /></radialGradient>
      <clipPath id="atlas-clip"><circle cx="50" cy="50" r="48" /></clipPath>
    </defs>
    <circle cx="50" cy="50" r="50" fill="url(#atlas-bg)" />
    <g clipPath="url(#atlas-clip)" stroke={INK} strokeLinejoin="round" strokeLinecap="round">
      {/* the sky: a sphere of night with its circles and stars */}
      <g className="atlas-sky">
        <circle cx="50" cy="33" r="23" fill="url(#atlas-sky)" strokeWidth="2.6" />
        <ellipse cx="50" cy="33" rx="9" ry="23" fill="none" stroke={GOLD} strokeWidth="1.5" />
        <path d="M27.6 28.5c14 5 30.8 5 44.8 0" fill="none" stroke={GOLD} strokeWidth="1.5" />
        <path d="M28 39c13 4.5 31 4.5 44 0" fill="none" stroke={GOLD} strokeWidth="1.1" opacity=".7" />
        <g fill={LIGHT} stroke="none">
          <path d="M38 19l1 2.3 2.4.3-1.8 1.6.5 2.4-2.1-1.2-2.1 1.2.5-2.4-1.8-1.6 2.4-.3Z" />
          <path d="M62 37l.8 1.8 1.9.2-1.4 1.3.4 1.9-1.7-1-1.7 1 .4-1.9-1.4-1.3 1.9-.2Z" />
          <circle cx="58" cy="20" r="1.1" /><circle cx="35" cy="34" r=".9" /><circle cx="46" cy="44" r=".9" /><circle cx="66" cy="27" r=".8" />
        </g>
      </g>
      {/* the arms, up to the sphere */}
      <path d="M36 66c-6-6-10-14-10-22M64 66c6-6 10-14 10-22" fill="none" strokeWidth="8" />
      <path d="M36 66c-6-6-10-14-10-22M64 66c6-6 10-14 10-22" fill="none" stroke={SKIN} strokeWidth="5" />
      <circle cx="26.5" cy="42" r="3.6" fill={SKIN} strokeWidth="1.8" /><circle cx="73.5" cy="42" r="3.6" fill={SKIN} strokeWidth="1.8" />
      {/* the legs: one knee down, one foot planted */}
      <path d="M44 84 31 92l2 6h-6" fill="none" strokeWidth="8" />
      <path d="M44 84 31 92l2 6h-6" fill="none" stroke={SKIN} strokeWidth="5" />
      <path d="M57 84l9-4 2 18" fill="none" strokeWidth="8" />
      <path d="M57 84l9-4 2 18" fill="none" stroke={SKIN} strokeWidth="5" />
      {/* the torso, broad, and the cloth at the waist */}
      <path d="M34 64c4-3 9-4 16-4s12 1 16 4l-4 18H38Z" fill={SKIN} strokeWidth="2.2" />
      <path d="M44 68c2 2 4 2 6 2s4 0 6-2M50 70v8" fill="none" strokeWidth="1.2" />
      <path d="M37 80h26l-2 7H39Z" fill={GOLD} strokeWidth="2" />
      {/* the head, bowed under the sky, with its beard */}
      <circle cx="50" cy="60" r="6.4" fill={SKIN} strokeWidth="2" />
      <path d="M44.6 57.2c1-3 3-4.6 5.4-4.6s4.4 1.6 5.4 4.6c-1.6-.8-3.4-1.2-5.4-1.2s-3.8.4-5.4 1.2Z" fill="#4a3412" strokeWidth="1.1" />
      <path d="M46.2 59.6h2.2M51.6 59.6h2.2" fill="none" strokeWidth="1.3" />
      <path d="M45.2 62.6c.4 3.4 2.4 5.6 4.8 5.6s4.4-2.2 4.8-5.6c-1.4.9-3 1.3-4.8 1.3s-3.4-.4-4.8-1.3Z" fill="#4a3412" strokeWidth="1.2" />
    </g>
    <circle cx="50" cy="50" r="45" fill="none" stroke={GOLD} strokeWidth="2.2" strokeDasharray="3 2.2" />
  </svg>
}
