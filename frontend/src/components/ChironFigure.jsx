// Olympus: Chiron, drawn whole: the old centaur who trained Achilles, in the gold-and-ink style
// of the coaches' portraits. One figure with moving parts, posed by `state`:
//
//   asleep     lying down, legs folded under him, head on his chest, breathing; z's drift up
//   waking     he rises, stretches an arm up, opens his eyes (a second or so, then idle)
//   idle       standing, awake, blinking, his tail swinging now and then
//   listening  a hand cupped at his ear, rings of sound coming in
//   thinking   a hand on his beard, eyes up, three dots
//   speaking   one arm out as he explains; the mouth opens with `mouth` (0 to 1), waves going out
//
// Every move is a CSS transition or animation on a group (chiron.css), so the parts glide from
// one pose to the next; `mouth` is set many times a second while he talks (components/Chiron.jsx).
const INK = '#1a1200'
const GOLD = '#d9a21b'
const GOLD_D = '#b07f0c'
const LIGHT = '#f7d466'
const SKIN = '#fcf0dc'
const HAIR = '#f1ece2'
const CLOAK = '#8f2f1c'

function Leg({ x, far, id }) {
  // A leg from the hip down: thigh, cannon and hoof, as one shape.
  return <g className={'chf-leg chf-' + id} style={{ transformOrigin: `${x + 4}px 100px` }}>
    <path d={`M${x} 98 C${x - 1} 110 ${x + 1} 118 ${x + 1} 130 L${x + 1} 136 L${x + 7.5} 136 L${x + 7.5} 129 C${x + 8} 118 ${x + 10} 108 ${x + 9} 98 Z`}
      fill={far ? GOLD_D : GOLD} />
    <path d={`M${x} 136.2h8.6v4.2h-8.6Z`} fill={INK} />
  </g>
}

export default function ChironFigure({ state = 'asleep', mouth = 0, size = 150, className = '' }) {
  const open = Math.max(0, Math.min(1, Number(mouth) || 0))
  const awake = state !== 'asleep'
  return <svg className={'chf chf-' + state + ' ' + className} viewBox="0 0 200 150" width={size} height={size * 0.75}
    role="img" aria-label="Chiron">
    <defs>
      <radialGradient id="chf-glow" cx=".5" cy=".5" r=".5">
        <stop offset="0" stopColor={LIGHT} stopOpacity=".9" /><stop offset="1" stopColor={LIGHT} stopOpacity="0" />
      </radialGradient>
    </defs>
    {/* the light he wakes in */}
    <ellipse className="chf-halo" cx="118" cy="62" rx="62" ry="52" fill="url(#chf-glow)" />
    {/* the ground */}
    <ellipse className="chf-shadow" cx="96" cy="141" rx="62" ry="5" fill={INK} opacity=".18" />

    <g className="chf-all" stroke={INK} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <g className="chf-horse">
        {/* the far legs, then the tail, the body and the near legs */}
        {/* the legs come out from under the body, so lying down they fold away behind it */}
        <Leg x={62} far id="hl2" />
        <Leg x={120} far id="fl2" />
        <Leg x={52} id="hl1" />
        <Leg x={110} id="fl1" />
        <path className="chf-tail" d="M50 82c-14 0-20 14-18 30 3 10 6 16 4 24 8-6 10-18 8-28 0-10 4-18 10-22Z" fill={HAIR} />
        <path d="M46 84c0-12 14-18 30-17l36 1c14 1 24 9 23 23-1 12-9 19-23 19H72c-16 0-26-10-26-26Z" fill={GOLD} />
        <path d="M60 74c10-3 30-3 44-1" fill="none" stroke={LIGHT} strokeWidth="2.4" opacity=".8" />
      </g>

      <g className="chf-man" style={{ transformOrigin: '124px 86px' }}>
        {/* the far arm, behind him */}
        <path d="M112 58c-6 8-8 16-8 26" fill="none" stroke={INK} strokeWidth="7" />
        <path d="M112 58c-6 8-8 16-8 26" fill="none" stroke={SKIN} strokeWidth="4.2" />
        {/* the torso, out of the horse's withers, and the cloak over one shoulder */}
        <path d="M108 86c-4-14-2-30 8-36 6-3 16-3 22 0 10 6 12 22 8 36Z" fill={SKIN} />
        <path d="M112 52c10 8 22 20 32 32l-6 3c-10-10-20-20-28-28Z" fill={CLOAK} />
        <path d="M110 56c2 10 1 22-2 30h6c2-8 3-18 1-28Z" fill={CLOAK} />

        <g className="chf-head" style={{ transformOrigin: '127px 50px' }}>
          {/* hair behind, the face, the beard */}
          <path d="M113 34c-2-12 6-20 14-20s16 8 14 20c-1 8-4 12-14 12s-13-4-14-12Z" fill={HAIR} />
          <path d="M116 33c0-9 5-14 11-14s11 5 11 14c0 6-2 10-11 10s-11-4-11-10Z" fill={SKIN} />
          <g className="chf-beard">
            <path d="M115.5 35c0 9 2 17 5 23l2-3 2 6 3-4 3 4 2-6 2 3c3-6 5-14 5-23-2 4-5 6-8 6-1.6-2.6-2.8-3-4-3s-2.4.4-4 3c-3 0-6-2-8-6Z" fill={HAIR} />
            <path d="M121 47c2 3 4 4 6 4s4-1 6-4M124.5 55l2.5 3 2.5-3" fill="none" strokeWidth="1" />
          </g>
          {/* the mouth, opening as he speaks */}
          <ellipse className="chf-mouth" cx="127" cy="41.2" rx="2.6" ry={0.5 + open * 2.6} fill={awake && open > 0.05 ? '#5a1d10' : INK} strokeWidth="1" />
          {/* moustache over it */}
          <path d="M127 38.6c-2.2-1.4-5.2-1-7 1.2 2.4.2 4.8-.2 7-1.2 2.2 1 4.6 1.4 7 1.2-1.8-2.2-4.8-2.6-7-1.2Z" fill={HAIR} strokeWidth="1.1" />
          {/* the nose, brows and eyes */}
          <path d="M127 30v5l-1.4.9" fill="none" strokeWidth="1.2" />
          <g className="chf-brows"><path d="M119.5 27.6c1.8-1.3 4.2-1.3 6 0M128.5 27.6c1.8-1.3 4.2-1.3 6 0" fill="none" strokeWidth="1.6" /></g>
          {awake
            ? <g className="chf-eyes"><ellipse cx="122.5" cy="31" rx="1.7" ry="1.9" fill={INK} stroke="none" /><ellipse cx="131.5" cy="31" rx="1.7" ry="1.9" fill={INK} stroke="none" />
              <circle cx="123.1" cy="30.4" r=".55" fill="#fff" stroke="none" /><circle cx="132.1" cy="30.4" r=".55" fill="#fff" stroke="none" /></g>
            : <g className="chf-eyes" fill="none" strokeWidth="1.4"><path d="M120.4 31.4q2.1 1.6 4.2 0M129.4 31.4q2.1 1.6 4.2 0" /></g>}
          {/* the laurel wreath */}
          <g fill={GOLD} strokeWidth="1">
            {[[115.5, 26, -55], [118, 21, -35], [122.5, 17.6, -15], [131.5, 17.6, 15], [136, 21, 35], [138.5, 26, 55]].map(([x, y, a]) =>
              <ellipse key={x} cx={x} cy={y} rx="2" ry="3.6" transform={`rotate(${a} ${x} ${y})`} />)}
          </g>
        </g>

        {/* the near arm: upper arm from the shoulder, forearm from the elbow */}
        <g className="chf-arm" style={{ transformOrigin: '141px 56px' }}>
          <path d="M141 56l5 16" fill="none" stroke={INK} strokeWidth="8" />
          <path d="M141 56l5 16" fill="none" stroke={SKIN} strokeWidth="5" />
          <g className="chf-fore" style={{ transformOrigin: '146px 72px' }}>
            <path d="M146 72l3 15" fill="none" stroke={INK} strokeWidth="7.4" />
            <path d="M146 72l3 15" fill="none" stroke={SKIN} strokeWidth="4.6" />
            <circle cx="149.4" cy="89" r="3.4" fill={SKIN} />
          </g>
        </g>
      </g>
    </g>

    {/* asleep: z's */}
    <g className="chf-z" fill={GOLD} stroke={INK} strokeWidth=".7" fontFamily="Georgia,serif" fontWeight="700">
      <text className="z1" x="146" y="40" fontSize="11">z</text><text className="z2" x="154" y="28" fontSize="14">z</text><text className="z3" x="164" y="14" fontSize="17">Z</text>
    </g>
    {/* listening: rings of sound coming to his ear */}
    <g className="chf-rings" fill="none" stroke={GOLD} strokeWidth="2.2" strokeLinecap="round">
      <path className="r1" d="M156 22c4 4 4 12 0 16" /><path className="r2" d="M163 16c7 7 7 21 0 28" /><path className="r3" d="M170 10c10 10 10 30 0 40" />
    </g>
    {/* thinking: three dots */}
    <g className="chf-dots" fill={GOLD} stroke={INK} strokeWidth=".8">
      <circle className="d1" cx="148" cy="20" r="2.6" /><circle className="d2" cx="157" cy="14" r="3.2" /><circle className="d3" cx="167" cy="8" r="3.8" />
    </g>
    {/* speaking: waves going out */}
    <g className="chf-waves" fill="none" stroke={GOLD} strokeWidth="2.2" strokeLinecap="round">
      <path className="w1" d="M142 38c3 2 3 6 0 8" /><path className="w2" d="M148 34c5 4 5 12 0 16" /><path className="w3" d="M154 30c7 6 7 18 0 24" />
    </g>
  </svg>
}
