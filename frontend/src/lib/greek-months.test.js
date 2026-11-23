import { describe, expect, test } from 'vitest'
import { ATTIC_MONTHS, atticMonthFor } from './greek-months.js'

describe('Attic month themes', () => {
  test('every modern month takes exactly one Attic month', () => {
    const months = ATTIC_MONTHS.map(m => m.month).sort((a, b) => a - b)
    expect(months).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(new Set(ATTIC_MONTHS.map(m => m.name)).size).toBe(12)
    expect(new Set(ATTIC_MONTHS.map(m => m.art)).size).toBe(12)
  })

  test('the Attic year runs in order, one modern month per Attic month, from July', () => {
    // Listed in Attic order: each starts in the modern month after the previous one.
    ATTIC_MONTHS.forEach((m, i) => expect(m.month).toBe((6 + i) % 12))
  })

  test('a month takes the Attic month that starts in it', () => {
    expect(atticMonthFor(6).name).toBe('Hekatombaion') // first new moon after the solstice
    expect(atticMonthFor(9).name).toBe('Pyanepsion') // October into November
    expect(atticMonthFor(10).name).toBe('Maimakterion') // November into December
    expect(atticMonthFor(0).name).toBe('Gamelion')
  })

  test('wraps out-of-range month numbers', () => {
    expect(atticMonthFor(12)).toBe(atticMonthFor(0))
    expect(atticMonthFor(-1)).toBe(atticMonthFor(11))
  })
})
