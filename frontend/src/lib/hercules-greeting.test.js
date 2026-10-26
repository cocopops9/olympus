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

  it('each coach introduces herself or himself once, then they take turns, one a day', () => {
    const both = { coaches: ['hercules', 'athena'], names: { hercules: 'Hercules', athena: 'Athena' } }
    const a = takeGreeting('v', S([]), '2026-10-26', both)
    expect(a.coach).toBe('hercules'); expect(a.kind).toBe('hello')
    const b = takeGreeting('v', S([]), '2026-10-26', both)
    expect(b.coach).toBe('athena'); expect(b.text).toMatch(/Athena/)
    expect(takeGreeting('v', S([]), '2026-10-26', both)).toBeNull()
    const d1 = takeGreeting('v', S(['2026-10-25']), '2026-10-27', both)
    const d2 = takeGreeting('v', S(['2026-10-25']), '2026-10-28', both)
    expect(new Set([d1.coach, d2.coach])).toEqual(new Set(['hercules', 'athena']))
  })

  it('reads the record older versions kept: Hercules had said hello', () => {
    localStorage.setItem('olympus_hercules_greet_w', JSON.stringify({ day: '2026-10-25' }))
    const g = takeGreeting('w', S([]), '2026-10-26', { coaches: ['hercules', 'athena'], names: {} })
    expect(g.coach).toBe('athena')
  })
})
