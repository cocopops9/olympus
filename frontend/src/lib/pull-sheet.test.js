import { describe, it, expect } from 'vitest'
import { pullOutcome, pullOpacity, PULL_SHRINK, PULL_CLOSE } from './pull-sheet.js'

const H = 800
describe('pullOutcome', () => {
  it('springs back after a short, slow pull', () => {
    expect(pullOutcome({ pull: 60, height: H, ms: 600 })).toBe('stay')
    expect(pullOutcome({ pull: 0, height: H, ms: 10 })).toBe('stay')
  })
  it('gives the small window when let go about halfway', () => {
    expect(pullOutcome({ pull: H * 0.5, height: H, ms: 800 })).toBe('shrink')
    expect(pullOutcome({ pull: H * PULL_SHRINK, height: H, ms: 800 })).toBe('shrink')
    expect(pullOutcome({ pull: H * PULL_CLOSE - 1, height: H, ms: 800 })).toBe('shrink')
  })
  it('closes the panel when pulled all the way down', () => {
    expect(pullOutcome({ pull: H * PULL_CLOSE, height: H, ms: 800 })).toBe('close')
    expect(pullOutcome({ pull: H * 0.92, height: H, ms: 300 })).toBe('close')
  })
  it('reads a quick flick as one step down, never as a close', () => {
    expect(pullOutcome({ pull: 80, height: H, ms: 100 })).toBe('shrink')
    expect(pullOutcome({ pull: 30, height: H, ms: 20 })).toBe('stay')
  })
  it('uses fractions of the screen, so a tall phone behaves like a small one', () => {
    expect(pullOutcome({ pull: 600, height: 1200, ms: 900 })).toBe('shrink')
    expect(pullOutcome({ pull: 600, height: 800, ms: 900 })).toBe('close')
  })
  it('is safe with no height', () => {
    expect(pullOutcome({ pull: 100, height: 0, ms: 10 })).toBe('stay')
  })
})

describe('pullOpacity', () => {
  it('fades as the pull grows and is faint past the close line', () => {
    expect(pullOpacity(0, H)).toBe(1)
    expect(pullOpacity(H * 0.35, H)).toBeCloseTo(0.8)
    expect(pullOpacity(H * 0.8, H)).toBe(0.3)
  })
})
