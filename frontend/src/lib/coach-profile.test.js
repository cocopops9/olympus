// @vitest-environment happy-dom
// What the AI coaches are told you train for, and the workout in progress (lib/coach-profile.js),
// at the top of the summary they read (lib/hercules-context.js).
import { describe, expect, it } from 'vitest'
import { coachProfileOf, profileLines, liveWorkoutLines, hasCoachProfile } from './coach-profile.js'
import { herculesContext, suggestionsFor } from './hercules-context.js'

const base = { unit: 'kg', body: 'male', workouts: [], routines: [], exWeights: {}, bodyweight: [], week: {}, dayPlan: {} }

describe('coach profile', () => {
  it('reads back only known styles and phases, and trims the goals', () => {
    const p = coachProfileOf({ coachProfile: { styles: ['bodybuilding', 'nope', 'bodybuilding'], phase: 'x', goals: '  overload  ' } })
    expect(p).toEqual({ styles: ['bodybuilding'], phase: null, goals: 'overload' })
    expect(hasCoachProfile({})).toBe(false)
  })
  it('goes to the coach first, in plain words', () => {
    const S = { ...base, coachProfile: { styles: ['functional'], phase: 'build', goals: 'Football in 3 days' } }
    const lines = profileLines(S)
    expect(lines[0]).toMatch(/WHAT THEY TRAIN FOR/)
    expect(lines.join('\n')).toContain('functional training')
    expect(lines.join('\n')).toContain('surplus')
    expect(lines.join('\n')).toContain('"Football in 3 days"')
    expect(herculesContext(S, '2026-10-26').startsWith('WHAT THEY TRAIN FOR')).toBe(true)
    expect(profileLines(base)).toEqual([])
  })
  it('the workout in progress: sets done and planned, the current exercise, the time', () => {
    const now = 30 * 60000
    const S = { ...base, active: { name: 'Legs', start: 0, cur: 0, entries: [
      { id: 'x1', n: 'Squat', sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5, done: false }] },
      { id: 'x2', n: 'Lunge', sets: [{ w: 20, r: 10, done: false }] },
    ] } }
    const lines = liveWorkoutLines(S, now)
    expect(lines[0]).toMatch(/WORKOUT IN PROGRESS/)
    expect(lines[1]).toContain('30 min in')
    expect(lines[2]).toContain('Squat <- current exercise: done 100 kg x 5; still planned 100 kg x 5')
    expect(lines[3]).toContain('Lunge: done nothing yet')
    expect(liveWorkoutLines({ ...S, active: { ...S.active, backfill: { d: '2026-10-01' } } })).toEqual([])
    expect(suggestionsFor('hercules', { live: true })[0]).toMatch(/next set/)
  })
})
