import { describe, it, expect } from 'vitest'
import { medalsOf, allMedals, newlyEarned, nextMedal, funOf } from './medals.js'
import { LIFTS } from './strength-level.js'

const squat = LIFTS.find(l => l.key === 'squat').id
const DAY = 86400000
const T0 = Date.UTC(2026, 0, 5, 18)   // a Monday
const iso = ms => new Date(ms).toISOString().slice(0, 10)
const workout = (i, { vol = 3000, sets = [], ex = squat, hour = 18, mins = 60 } = {}) => {
  const start = T0 + i * 3 * DAY + (hour - 18) * 3600000
  return { id: 'w' + i, d: iso(start), start, end: start + mins * 60000, vol, prs: [], entries: sets.length ? [{ id: ex, sets: sets.map(([w, r]) => ({ w, r, done: true })) }] : [] }
}
const person = (over = {}) => ({ unit: 'kg', body: 'male', birth: '1996-03-01', bodyweight: [{ d: '2026-01-01', w: 80 }], workouts: [], wposts: {}, medals: {}, ...over })
const NOW = T0 + 200 * DAY
const ids = groups => allMedals(groups).map(m => m.id)

describe('medals', () => {
  it('compares a volume with something heavy', () => {
    expect(funOf(10000)).toMatch(/1\.3 × T\. rex/)
    expect(funOf(6000)).toMatch(/1 × African elephant/)
    expect(funOf(100)).toBe('')
  })

  it('a light beginner is never shown a 150 kg squat, but sees reachable targets', () => {
    const S = person({ body: 'female', bodyweight: [{ d: '2026-01-01', w: 50 }], workouts: [0, 1, 2].map(i => workout(i, { vol: 360, sets: [[10, 12], [10, 12], [10, 12]] })) })
    const g = medalsOf(S, {}, NOW)
    const lifts = allMedals(g).filter(m => m.id.startsWith('lift:squat:'))
    expect(lifts.length).toBeGreaterThan(0)
    expect(lifts.every(m => m.value <= 100)).toBe(true)
    expect(ids(g)).not.toContain('lift:squat:150')
    expect(ids(g)).toContain('vol-session:1000')
  })

  it('an advanced athlete is not congratulated for what was below their first workout', () => {
    const S = person({ workouts: [0, 1, 2, 3, 4, 5].map(i => workout(i, { vol: 9000 + i * 300, sets: [[160, 5], [160, 5]] })) })
    const g = medalsOf(S, {}, NOW)
    const session = allMedals(g).filter(m => m.id.startsWith('vol-session:'))
    expect(session.map(m => m.value)).not.toContain(1000)
    expect(session.map(m => m.value)).not.toContain(2500)
    expect(session.find(m => m.value === 7500)?.earned).toBe(true)   // the highest earned stays
    expect(session.some(m => !m.earned && m.value === 15000)).toBe(true)
    const squats = allMedals(g).filter(m => m.id.startsWith('lift:squat:'))
    expect(squats.map(m => m.value)).not.toContain(60)
    expect(squats.some(m => !m.earned)).toBe(true)
  })

  it('personal strength medals wait for three sessions over two weeks, then start from where the athlete began', () => {
    const early = person({ workouts: [0, 1].map(i => workout(i, { sets: [[100, 5]] })) })
    const g0 = medalsOf(early, {}, NOW)
    expect(ids(g0).some(i => i.startsWith('pt:squat:'))).toBe(false)
    expect(g0.find(g => g.key === 'strength').pending.map(p => p.key)).toContain('squat')
    // Three weeks of sessions, then steady progress: 2.5 kg a session for ten weeks.
    const ws = Array.from({ length: 36 }, (_, i) => workout(i, { sets: [[100 + Math.max(0, i - 6) * 2.5, 5]] }))
    const pt = allMedals(medalsOf(person({ workouts: ws }), {}, NOW)).filter(m => m.id.startsWith('pt:squat:'))
    expect(pt.find(m => m.tier === 'bronze')?.earned).toBe(true)
    expect(pt.find(m => m.tier === 'olympian')?.earned ?? false).toBe(false)
    // Targets rise with the tier.
    const vals = pt.map(m => m.value)
    expect([...vals].sort((a, b) => a - b)).toEqual(vals)
  })

  it('shows no personal strength medal without a birth date and a body weight, and says what is missing', () => {
    const ws = Array.from({ length: 10 }, (_, i) => workout(i, { sets: [[100, 5]] }))
    const g = medalsOf(person({ birth: '', workouts: ws }), {}, NOW)
    expect(ids(g).some(i => i.startsWith('pt:'))).toBe(false)
    expect(g.find(x => x.key === 'strength').missing).toContain('birth')
  })

  it('keeps a celebrated medal won when its target moves', () => {
    const ws = Array.from({ length: 12 }, (_, i) => workout(i, { sets: [[100, 5]] }))
    const g = medalsOf(person({ workouts: ws, medals: { got: { 'pt:squat:bronze': T0 } } }), {}, NOW)
    expect(allMedals(g).find(m => m.id === 'pt:squat:bronze')?.earned).toBe(true)
  })

  it('social medals come first and count invites, invitations, stories and posts', () => {
    const S = person({ medals: { invites: 6, stories: 1 }, wposts: { a: 'p1', b: '-', c: 'p2' } })
    const g = medalsOf(S, { invited: 3 }, NOW)
    expect(g[0].key).toBe('social')
    const soc = g[0].medals
    expect(soc.find(m => m.id === 'invited:3')?.earned).toBe(true)
    expect(soc.find(m => m.id === 'invited:5')?.earned).toBe(false)
    expect(soc.find(m => m.id === 'invites:5')?.earned).toBe(true)
    expect(soc.find(m => m.id === 'stories:1')?.earned).toBe(true)
    expect(soc.find(m => m.id === 'posts:1')?.earned).toBe(true)
  })

  it('streaks, counts and the special ones', () => {
    const ws = Array.from({ length: 10 }, (_, i) => ({ ...workout(0), id: 'k' + i, d: iso(T0 + i * 7 * DAY), start: T0 + i * 7 * DAY - (i === 2 ? 13 * 3600000 : 0), end: T0 + i * 7 * DAY + (i === 3 ? 3 : 1) * 3600000 }))
    const g = medalsOf(person({ workouts: ws }), {}, NOW)
    const all = allMedals(g)
    expect(all.find(m => m.id === 'streak:8')?.earned).toBe(true)
    expect(all.find(m => m.id === 'count:10')?.earned).toBe(true)
    expect(all.find(m => m.id === 'special:early')?.earned).toBe(true)
    expect(all.find(m => m.id === 'special:long')?.earned).toBe(true)
  })

  it('what is new is what was not celebrated yet, best first, and the next is the closest', () => {
    const g = medalsOf(person({ workouts: [workout(0, { vol: 5200 })] }), {}, NOW)
    const fresh = newlyEarned(g, { 'count:1': 1 })
    expect(fresh.map(m => m.id)).toContain('vol-session:5000')
    expect(fresh.map(m => m.id)).not.toContain('count:1')
    expect(nextMedal(g)).toBeTruthy()
  })

  it('works in pounds with pound targets', () => {
    const g = medalsOf(person({ unit: 'lb', workouts: [workout(0, { vol: 5000 })] }), {}, NOW)
    expect(ids(g)).toContain('vol-session:5000')
    expect(allMedals(g).find(m => m.id === 'vol-session:5000').title).toMatch(/lb/)
  })
})

describe('medals: starting above a level', () => {
  it('a strong lifter and a beginner both have a bronze still to earn, the strong one by a smaller step', () => {
    const steady = w => Array.from({ length: 8 }, (_, i) => workout(i, { sets: [[w, 5]] }))
    const bronze = S => allMedals(medalsOf(S, {}, NOW)).find(m => m.id === 'pt:squat:bronze')
    const strong = bronze(person({ workouts: steady(180) })), weak = bronze(person({ workouts: steady(50) }))
    expect(strong.earned).toBe(false)
    expect(weak.earned).toBe(false)
    const e1 = w => w * (1 + 5 / 30)
    expect(strong.value / e1(180)).toBeGreaterThan(1.01)
    expect(strong.value / e1(180)).toBeLessThan(weak.value / e1(50))
  })
})
