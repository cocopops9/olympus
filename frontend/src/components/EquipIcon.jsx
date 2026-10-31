// Olympus: a small drawing for each kind of equipment of the catalogue (lib/equipment-groups.js),
// so the equipment filter reads at a glance: under each family's name on its chip, and beside
// each kind in the sheet that picks one (components/EquipChips.jsx), where the plain barbell, the
// EZ bar, the Olympic bar, the trap bar and the landmine are told apart by their shape.
//
// Drawn like the app's icons (components/Icon.jsx): a 24-unit grid, round strokes in the text
// colour; the parts that carry the load (plates, heads, the ball) are filled with a soft tint of
// the accent (--eq-fill) so the drawing has weight.
const P = {
  barbell: <>
    <path d="M1.5 12h21" />
    <rect className="f" x="3.6" y="6" width="3.4" height="12" rx="1" /><rect className="f" x="7" y="8" width="2.2" height="8" rx=".7" />
    <rect className="f" x="17" y="6" width="3.4" height="12" rx="1" /><rect className="f" x="14.8" y="8" width="2.2" height="8" rx=".7" />
  </>,
  'ez barbell': <>
    <path d="M1.5 12h4M18.5 12h4M7.5 12l1.5-2.4 1.5 4.8 1.5-4.8 1.5 4.8 1.5-4.8 1.5 2.4" />
    <rect className="f" x="5.3" y="8" width="2.2" height="8" rx=".7" /><rect className="f" x="16.5" y="8" width="2.2" height="8" rx=".7" />
  </>,
  'olympic barbell': <>
    <path d="M.8 12h22.4" />
    <rect className="f" x="2.8" y="3.5" width="3.8" height="17" rx="1.1" /><rect className="f" x="17.4" y="3.5" width="3.8" height="17" rx="1.1" />
    <rect x="6.6" y="10.2" width="1.4" height="3.6" rx=".4" /><rect x="16" y="10.2" width="1.4" height="3.6" rx=".4" />
  </>,
  'trap bar': <>
    <path className="f" d="M4.5 12 8 6.5h8l3.5 5.5-3.5 5.5H8Z" />
    <path d="M10 9.4v5.2M14 9.4v5.2M.8 12h3.7M19.5 12h3.7" />
  </>,
  landmine: <>
    <path d="M2.5 21h7.5" /><circle cx="5.6" cy="19" r="1.6" />
    <path d="M6.8 17.9 19.5 5.2" />
    <rect className="f" x="15.6" y="4.4" width="3" height="7.6" rx=".8" transform="rotate(45 17.1 8.2)" />
  </>,
  dumbbell: <>
    <path d="M8.6 12h6.8" />
    <rect className="f" x="4.2" y="7.2" width="4.4" height="9.6" rx="1.6" /><rect className="f" x="15.4" y="7.2" width="4.4" height="9.6" rx="1.6" />
    <path d="M2.6 10v4M21.4 10v4" />
  </>,
  kettlebell: <>
    <path d="M8.2 11.2V8.6a3.8 3.8 0 0 1 7.6 0v2.6" />
    <path className="f" d="M12 9.2a6.3 6.3 0 0 1 4.6 10.6H7.4A6.3 6.3 0 0 1 12 9.2Z" />
    <path d="M10.2 9.6h3.6" />
  </>,
  cable: <>
    <path d="M4 2.4h16" /><path d="M12 2.4v1" />
    <circle className="f" cx="12" cy="5.6" r="2.3" />
    <path d="M12 7.9v7.3" />
    <path className="f" d="M12 15.2 8 20.6h8Z" />
  </>,
  band: <>
    <rect className="f" x="2.5" y="7.5" width="19" height="9" rx="4.5" />
    <rect x="5.5" y="10" width="13" height="4" rx="2" />
  </>,
  'resistance band': <>
    <rect className="f" x="1.6" y="9" width="4" height="6" rx="1.4" /><rect className="f" x="18.4" y="9" width="4" height="6" rx="1.4" />
    <path d="M5.6 12c2.2-5.5 4.4-5.5 6.4 0s4.2 5.5 6.4 0" />
  </>,
  'leverage machine': <>
    <path d="M4 21h11M12 21V8.5M5.5 15h6M6.5 15V7.5" />
    <circle className="f" cx="12" cy="8.5" r="1.7" />
    <path d="M13.6 8 20 5.4" /><circle className="f" cx="20.2" cy="5.3" r="1.7" />
  </>,
  'smith machine': <>
    <path d="M5 2.5v19M19 2.5v19M2.5 21.5h19M3.2 10.5h17.6" />
    <rect className="f" x="6.6" y="7.3" width="2.2" height="6.4" rx=".6" /><rect className="f" x="15.2" y="7.3" width="2.2" height="6.4" rx=".6" />
  </>,
  'sled machine': <>
    <path d="M2 21h20M4.5 19.5 19.5 6" />
    <path className="f" d="M12.4 9.2l3.9-3.5 2.3 2.6-3.9 3.5Z" />
    <path className="f" d="M2.8 13.6 6 18.6H3.2Z" />
    <circle className="f" cx="17.8" cy="11.6" r="2.1" />
  </>,
  'stationary bike': <>
    <circle className="f" cx="8" cy="16" r="3.8" />
    <path d="M8 16l4-6.5 5 8.5M12 9.5V7.6M10.6 7.4h3.2M17 18l1.3-9.5h2.3M4 21h16" />
  </>,
  'elliptical machine': <>
    <ellipse className="f" cx="10" cy="17" rx="6.5" ry="2.6" />
    <path d="M17.5 21V5M17.5 6.5 13 15M15.3 4.5h4.4M3 21h18" />
  </>,
  'upper body ergometer': <>
    <path d="M12 21v-9M7 21h10" />
    <circle className="f" cx="12" cy="8.5" r="3.3" />
    <path d="M12 8.5 9.8 6.4M12 8.5l2.2 2.1M8.6 5.2h-2M15.4 11.8h2" />
  </>,
  'skierg machine': <>
    <rect className="f" x="8.4" y="2.5" width="5.2" height="6" rx="1.2" />
    <path d="M11 8.5V21M7 21h8M11.6 8.5l5.4 5.6M12.2 8.5l6.6 4M16.2 13.4l1.5 1.4M18 11.8l1.4 1.5" />
  </>,
  'stepmill machine': <>
    <path className="f" d="M3 21h4.5v-3.5H12V14h4.5v-3.5H21V21Z" />
    <path d="M5 13 18.5 4.5M5 13v4.5M18.5 4.5V10" />
  </>,
  'body weight': <>
    <circle className="f" cx="12" cy="4.6" r="2.3" />
    <path d="M12 7.2V14M6 9.8h12M12 14l-3.6 7M12 14l3.6 7" />
  </>,
  weighted: <>
    <circle cx="12" cy="4.4" r="2.2" />
    <path d="M12 6.9V12.6M6.5 9h11M12 12.6l-3.3 7.8M12 12.6l3.3 7.8M9.4 12.6h5.2" />
    <circle className="f" cx="12" cy="16.4" r="2.8" />
  </>,
  assisted: <>
    <circle cx="9.5" cy="4.6" r="2.2" />
    <path d="M9.5 7.1v7M4.5 9.6h10M9.5 14.1l-3 6.9M9.5 14.1l3 6.9" />
    <path className="f" d="M19 21v-8.2h-2.6L19.8 8l3.4 4.8h-2.6V21Z" />
  </>,
  'suspension trainer': <>
    <path d="M12 1.5v4M12 5.5 7 15.5M12 5.5l5 10M8 2h8" />
    <rect className="f" x="4.6" y="15.5" width="4.6" height="2.2" rx="1.1" /><rect className="f" x="14.8" y="15.5" width="4.6" height="2.2" rx="1.1" />
  </>,
  'stability ball': <>
    <circle className="f" cx="12" cy="12" r="8.6" />
    <path d="M4.4 9.2c4.6 2.4 10.6 2.4 15.2 0M4.4 14.8c4.6-2.4 10.6-2.4 15.2 0" />
  </>,
  'medicine ball': <>
    <circle className="f" cx="12" cy="12" r="7.6" />
    <path d="M12 4.4v15.2M7 6.4c2.6 2.8 2.6 8.4 0 11.2M17 6.4c-2.6 2.8-2.6 8.4 0 11.2" />
  </>,
  'bosu ball': <>
    <path className="f" d="M3.4 16.6a8.6 8.6 0 0 1 17.2 0Z" />
    <rect x="2.4" y="16.6" width="19.2" height="2.8" rx="1" />
    <path d="M7.2 11.6c3.2 1.4 6.4 1.4 9.6 0" />
  </>,
  'weight plate': <>
    <circle className="f" cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.4" /><circle cx="12" cy="12" r="1" />
    <path d="M7.4 6.4a7 7 0 0 1 3-1.6M16.6 17.6a7 7 0 0 1-3 1.6" />
  </>,
  sandbag: <>
    <rect className="f" x="2.6" y="8" width="18.8" height="10.6" rx="4" />
    <path d="M7.2 8c0-2.6 3.2-2.6 3.2 0M13.6 8c0-2.6 3.2-2.6 3.2 0M3 13.3h18" />
  </>,
  rope: <>
    <path d="M2 15c2.6-6.6 5.4-6.6 7.6-1.6s5.2 5 7.4 0 3.6-4.2 5-2.6" />
    <rect className="f" x="1" y="14.6" width="2.4" height="5.2" rx=".9" transform="rotate(-12 2.2 17.2)" />
  </>,
  roller: <>
    <path className="f" d="M6.5 6.6h11a2.6 5.4 0 0 1 0 10.8h-11Z" />
    <ellipse cx="6.5" cy="12" rx="2.6" ry="5.4" />
    <path d="M10.5 8.6v.1M13.5 10.2v.1M10.5 13.4v.1M13.5 15v.1M16 8.8v.1M16 13.6v.1" />
  </>,
  'wheel roller': <>
    <circle className="f" cx="12" cy="12.5" r="5.8" /><circle cx="12" cy="12.5" r="1.4" />
    <path d="M2 12.5h4.2M17.8 12.5H22" />
    <rect x="1.6" y="11" width="3.2" height="3" rx="1" /><rect x="19.2" y="11" width="3.2" height="3" rx="1" />
  </>,
  macebell: <>
    <path d="M4.6 20.8 15.6 7" />
    <circle className="f" cx="17.6" cy="4.8" r="3.4" />
  </>,
  tire: <>
    <circle className="f" cx="12" cy="12" r="9.2" /><circle cx="12" cy="12" r="5" />
    <path d="M12 2.8v2.2M12 19v2.2M2.8 12H5M19 12h2.2M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6" />
  </>,
  hammer: <>
    <path d="M5 21.2 14 8.6" />
    <path className="f" d="M11.4 4.6l6.6 4.6-2.2 3.2-6.6-4.6Z" />
  </>,
  // "Any equipment": a few of them together.
  any: <>
    <rect className="f" x="2.5" y="3" width="8" height="8" rx="2" /><rect className="f" x="13.5" y="3" width="8" height="8" rx="2" />
    <rect className="f" x="2.5" y="13" width="8" height="8" rx="2" /><rect className="f" x="13.5" y="13" width="8" height="8" rx="2" />
  </>,
}

// What a family is drawn as: its most familiar kind.
const FAMILY = { barbell: 'barbell', dumbbell: 'dumbbell', machine: 'leverage machine', cable: 'cable', kettlebell: 'kettlebell', band: 'band', body: 'body weight', ball: 'stability ball', other: 'weight plate' }

export const hasEquipIcon = eq => !!P[eq]
export const familyIcon = id => FAMILY[id] || 'weight plate'

/** The drawing of equipment kind `eq` (a catalogue name, or 'any'); a weight plate for one not drawn. */
export default function EquipIcon({ eq, size = 24, className = '' }) {
  return <svg className={'eq-ico ' + className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
    fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {P[eq] || P['weight plate']}
  </svg>
}
