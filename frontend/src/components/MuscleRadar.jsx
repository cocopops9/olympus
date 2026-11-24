// Olympus: the muscle distribution radar on Stats. Six body regions on a hexagon; the gold shape is
// the period picked, the grey outline the period before it, both against the same rim
// (lib/muscle-distribution.js), so a corner that grew reaches further out than its outline.
import { t, tc } from '../lib/i18n.js'
import { REGIONS } from '../lib/muscle-distribution.js'
import { fmtNum } from '../lib/format.js'

const W = 320, H = 268
const CX = W / 2, CY = H / 2
const R = 92
const RINGS = [0.25, 0.5, 0.75, 1]

// Clockwise from the top left, the order REGIONS lists them in: back and chest at the top,
// core on the right, legs on the left.
const angleOf = i => (-120 + i * 60) * Math.PI / 180
const pointAt = (i, k) => [CX + Math.cos(angleOf(i)) * R * k, CY + Math.sin(angleOf(i)) * R * k]
const path = ks => ks.map((k, i) => pointAt(i, k).map(n => n.toFixed(1)).join(',')).join(' ')

// "Back" is also the button in every pack, so the region asks for its own key.
export const regionName = r => (r.id === 'back' ? tc('muscle', r.name) : t(r.name))

export default function MuscleRadar({ current, previous, scale }) {
  const share = regions => REGIONS.map(r => (scale > 0 ? Math.min(1, (regions[r.id] || 0) / scale) : 0))
  const cur = share(current), prev = share(previous)
  const label = REGIONS.map(r => `${regionName(r)} ${fmtNum(current[r.id] || 0)}`).join(', ')
  return <svg className="mradar" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Muscle distribution') + ': ' + label}>
    {RINGS.map(k => <polygon key={k} className="mradar-ring" points={path(REGIONS.map(() => k))} />)}
    {REGIONS.map((r, i) => {
      const [x, y] = pointAt(i, 1)
      return <line key={r.id} className="mradar-axis" x1={CX} y1={CY} x2={x} y2={y} />
    })}
    <polygon className="mradar-prev" points={path(prev)} />
    <polygon className="mradar-cur" points={path(cur)} />
    {cur.map((k, i) => k > 0 && <circle key={i} className="mradar-dot" cx={pointAt(i, k)[0]} cy={pointAt(i, k)[1]} r="3.2" />)}
    {REGIONS.map((r, i) => {
      const [x, y] = pointAt(i, 1.2)
      const cos = Math.cos(angleOf(i)), sin = Math.sin(angleOf(i))
      // The four corners above and below sit centred over their point, the two at the sides
      // read outwards from it.
      const anchor = Math.abs(sin) > 0.8 ? 'middle' : cos > 0 ? 'start' : 'end'
      // Name and sets on two lines, the pair kept clear of the rim on every side.
      const dy = sin < -0.1 ? -14 : sin > 0.1 ? 8 : -3
      return <text key={r.id} className="mradar-l" x={x} y={y + dy} textAnchor={anchor}>
        {regionName(r)}
        <tspan className="mradar-n" x={x} dy="15">{fmtNum(current[r.id] || 0)}</tspan>
      </text>
    })}
  </svg>
}
