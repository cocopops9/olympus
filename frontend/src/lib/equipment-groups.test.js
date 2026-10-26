// Equipment families (lib/equipment-groups.js): the 33 kinds of the catalogue in 9 families, the
// filter values, and the same movement with other equipment.
import { describe, expect, it } from 'vitest'
import { EXDB } from './exercises.js'
import { EQUIP_GROUPS, equipFamilies, matchesEquip, liveEquip, groupOf, equipmentVariants } from './equipment-groups.js'

const byName = n => EXDB.find(e => e.n === n)

describe('equipment families', () => {
  it('every kind in the catalogue belongs to exactly one family', () => {
    const kinds = new Set(EXDB.map(e => e.eq).filter(Boolean))
    const named = EQUIP_GROUPS.flatMap(g => g.eqs)
    expect(new Set(named).size).toBe(named.length)
    for (const k of kinds) expect(named).toContain(k)
    expect(equipFamilies(EXDB).length).toBeLessThanOrEqual(9)
  })

  it('Barbells holds the plain bar, the EZ bar and the trap bar; a family or one kind filters', () => {
    const fam = equipFamilies(EXDB).find(f => f.id === 'barbell')
    expect(fam.variants.map(v => v.eq)).toEqual(expect.arrayContaining(['barbell', 'ez barbell', 'trap bar']))
    const curl = byName('barbell curl'), ez = byName('ez barbell curl')
    expect(matchesEquip(curl, 'g:barbell') && matchesEquip(ez, 'g:barbell')).toBe(true)
    expect(matchesEquip(curl, 'e:ez barbell')).toBe(false)
    expect(matchesEquip(ez, 'e:ez barbell')).toBe(true)
    expect(matchesEquip(curl, '')).toBe(true)
    expect(groupOf('band')).toBe(groupOf('resistance band'))
    expect(groupOf('something homemade')).toBe('other')
  })

  it('drops a filter the list no longer has', () => {
    const fams = equipFamilies([byName('barbell curl')])
    expect(liveEquip(fams, 'g:barbell')).toBe('g:barbell')
    expect(liveEquip(fams, 'e:ez barbell')).toBe('')
    expect(liveEquip(fams, 'g:machine')).toBe('')
  })

  it('finds the same movement with other equipment, and not a different one', () => {
    const v = equipmentVariants(byName('barbell curl'), EXDB).map(e => e.n)
    expect(v).toContain('ez barbell curl')
    expect(v).not.toContain('barbell curl')
    const d = equipmentVariants(byName('barbell deadlift'), EXDB).map(e => e.eq)
    expect(d).toEqual(expect.arrayContaining(['trap bar', 'dumbbell']))
    expect(new Set(d).size).toBe(d.length)
    expect(equipmentVariants({ id: 'x', n: '', eq: 'barbell' }, EXDB)).toEqual([])
  })
})
