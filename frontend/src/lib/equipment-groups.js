// Olympus: the catalogue's 33 kinds of equipment, gathered into the families people think in.
// "Barbells" holds the plain barbell, the EZ bar, the trap bar, the Olympic bar and the landmine,
// so a barbell curl and an EZ-bar curl are both under it; pressing and holding a family's chip
// picks one of them (components/EquipChips.jsx).
//
// A filter value is '' (any equipment), 'g:<family id>' (the whole family) or 'e:<equipment>'
// (one kind). Equipment the families do not name (a custom exercise's own) counts as "Other".

export const EQUIP_GROUPS = [
  { id: 'barbell', label: 'Barbells', eqs: ['barbell', 'ez barbell', 'trap bar', 'olympic barbell', 'landmine'] },
  { id: 'dumbbell', label: 'dumbbell', eqs: ['dumbbell'] },
  { id: 'machine', label: 'Machines', eqs: ['leverage machine', 'smith machine', 'sled machine', 'stationary bike', 'elliptical machine', 'upper body ergometer', 'skierg machine', 'stepmill machine'] },
  { id: 'cable', label: 'cable', eqs: ['cable'] },
  { id: 'kettlebell', label: 'kettlebell', eqs: ['kettlebell'] },
  { id: 'band', label: 'Bands', eqs: ['band', 'resistance band'] },
  { id: 'body', label: 'Bodyweight', eqs: ['body weight', 'weighted', 'assisted', 'suspension trainer'] },
  { id: 'ball', label: 'Balls', eqs: ['stability ball', 'medicine ball', 'bosu ball'] },
  { id: 'other', label: 'Other equipment', eqs: ['weight plate', 'sandbag', 'rope', 'roller', 'wheel roller', 'macebell', 'tire', 'hammer'] },
]

const GROUP_OF = new Map(EQUIP_GROUPS.flatMap(g => g.eqs.map(eq => [eq, g.id])))
export const groupOf = eq => GROUP_OF.get(eq) || 'other'
export const groupById = id => EQUIP_GROUPS.find(g => g.id === id) || null

/** Does exercise `e` match filter `value`? */
export function matchesEquip(e, value) {
  if (!value) return true
  if (value.startsWith('e:')) return e.eq === value.slice(2)
  if (value.startsWith('g:')) return groupOf(e.eq) === value.slice(2)
  return e.eq === value
}

/**
 * The families present in `list`, in catalogue order, each with how many exercises it has and
 * its kinds present, most used first: [{ id, label, count, variants: [{ eq, count }] }].
 */
export function equipFamilies(list) {
  const per = new Map()
  for (const e of list) {
    if (!e.eq) continue
    per.set(e.eq, (per.get(e.eq) || 0) + 1)
  }
  const out = []
  const known = new Set(EQUIP_GROUPS.flatMap(g => g.eqs))
  for (const g of EQUIP_GROUPS) {
    const eqs = g.id === 'other' ? [...g.eqs, ...[...per.keys()].filter(eq => !known.has(eq))] : g.eqs
    const variants = eqs.filter(eq => per.get(eq)).map(eq => ({ eq, count: per.get(eq) }))
      .sort((a, b) => b.count - a.count || (a.eq < b.eq ? -1 : 1))
    const count = variants.reduce((n, v) => n + v.count, 0)
    if (count) out.push({ id: g.id, label: g.label, count, variants })
  }
  return out
}

/** A filter still in effect for `families` (one the search narrowed away is dropped), or ''. */
export function liveEquip(families, value) {
  if (!value) return ''
  if (value.startsWith('g:')) return families.some(f => f.id === value.slice(2)) ? value : ''
  if (value.startsWith('e:')) return families.some(f => f.variants.some(v => v.eq === value.slice(2))) ? value : ''
  return ''
}

// The words a catalogue name starts with for its equipment, longest first, so "ez barbell curl"
// loses "ez barbell" and not just "barbell".
const EQUIP_WORDS = ['ez barbell', 'ez-bar', 'ez bar', 'olympic barbell', 'trap bar', 'smith machine', 'smith', 'barbell',
  'dumbbell', 'kettlebell', 'cable', 'lever', 'leverage machine', 'sled', 'band', 'resistance band', 'landmine', 'weighted',
  'medicine ball', 'stability ball', 'bosu ball', 'suspension', 'sandbag', 'weight plate', 'plate']
  .sort((a, b) => b.length - a.length)
const stripEquip = name => {
  let n = String(name || '').toLowerCase().trim()
  for (let changed = true; changed;) {
    changed = false
    for (const w of EQUIP_WORDS) if (n.startsWith(w + ' ')) { n = n.slice(w.length + 1); changed = true; break }
  }
  return n.replace(/\s*\((with )?[^)]*\)$/, '').trim()
}

/**
 * The same movement with other equipment: "barbell curl" finds "ez barbell curl", "dumbbell
 * curl" does not match "dumbbell biceps curl". The exercise itself is left out; one per kind.
 */
export function equipmentVariants(ex, list) {
  const core = stripEquip(ex?.n)
  if (!core || !ex?.eq) return []
  const seen = new Set([ex.eq])
  const out = []
  for (const e of list) {
    if (e.id === ex.id || seen.has(e.eq) || stripEquip(e.n) !== core) continue
    seen.add(e.eq)
    out.push(e)
  }
  return out
}
