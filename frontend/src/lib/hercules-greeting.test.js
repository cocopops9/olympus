// @vitest-environment happy-dom
// What Hercules says from his portrait (lib/hercules-greeting.js): hello the first time, then a
// line that fits the person's training, at most once a day.
import { beforeEach, describe, expect, it } from 'vitest'
import { greetingFor, takeGreeting } from './hercules-greeting.js'

const S = days => ({ workouts: days.map((d, i) => ({ id: 'w' + i, d })) })

describe('Hercules greeting', () => {
  beforeEach(() => { try { localStorage.clear() } catch { /* node without storage */ } })

  it('fits the training', () => {
    expect(greetingFor(S([]), '2026-10-26').kind).toBe('hello')
    expect(greetingFor(S(['2026-10-20', '2026-10-26']), '2026-10-26').kind).toBe('done')
    expect(greetingFor(S(['2026-10-26']), '2026-10-26').ask).toMatch(/feedback/)
    expect(greetingFor(S(['2026-10-20']), '2026-10-26').kind).toBe('idle')
    expect(greetingFor(S(['2026-10-24']), '2026-10-26').kind).toBe('tip')
    expect(greetingFor(S(['2026-10-26']), '2026-10-26', true).kind).toBe('hello')
  })

  it('says hello the first time, then once a day', () => {
    expect(takeGreeting('u', S(['2026-10-26']), '2026-10-26').kind).toBe('hello')
    expect(takeGreeting('u', S(['2026-10-26']), '2026-10-26')).toBeNull()
    expect(takeGreeting('u', S(['2026-10-26']), '2026-10-27').kind).toBe('tip')
    expect(takeGreeting('other', S([]), '2026-10-27').kind).toBe('hello')
  })
})
