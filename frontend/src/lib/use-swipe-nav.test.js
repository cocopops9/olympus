import { describe, expect, it } from 'vitest'
import { swipeStep, SWIPE_MIN } from './use-swipe-nav.js'

describe('swipeStep', () => {
  it('turns back on a swipe toward the end of the line and forward toward its start', () => {
    expect(swipeStep(SWIPE_MIN + 10, 0)).toBe(-1)
    expect(swipeStep(-(SWIPE_MIN + 10), 0)).toBe(1)
  })

  it('swaps the two ways in a right-to-left page', () => {
    expect(swipeStep(SWIPE_MIN + 10, 0, true)).toBe(1)
    expect(swipeStep(-(SWIPE_MIN + 10), 0, true)).toBe(-1)
  })

  it('ignores a short or a mostly vertical move, which is a tap or the page scrolling', () => {
    expect(swipeStep(SWIPE_MIN - 1, 0)).toBe(0)
    expect(swipeStep(120, 100)).toBe(0)
    expect(swipeStep(150, 99)).toBe(-1)
    expect(swipeStep(NaN, 0)).toBe(0)
  })
})
