import { describe, expect, it } from 'vitest'
import { resolveTheme, toggledTheme } from './theme.js'

describe('resolveTheme', () => {
  it('keeps a fixed choice whatever the OS prefers', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('follows the OS preference for system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('treats an unknown or missing value like system', () => {
    expect(resolveTheme(undefined, true)).toBe('dark')
    expect(resolveTheme('sepia', false)).toBe('light')
  })
})

describe('toggledTheme', () => {
  it('flips a fixed choice', () => {
    expect(toggledTheme('dark', false)).toBe('light')
    expect(toggledTheme('light', true)).toBe('dark')
  })

  it('flips what system currently shows, and stores it as a fixed choice', () => {
    expect(toggledTheme('system', true)).toBe('light')
    expect(toggledTheme('system', false)).toBe('dark')
  })
})
