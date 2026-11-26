// Calliope's moments (lib/calliope-moments.js): which situation is noticed, that each is told once,
// that switching help off silences them, and how long a bubble stays.
import { describe, expect, it } from 'vitest'
import { MOMENTS, MOMENT_IDS, momentDue, momentFor, momentMs, situationsOf, withMomentSeen, withMomentsReset, MIN_MS, MAX_MS } from './calliope-moments.js'
import { withTipsReset, withToursReset } from './guide.js'

const entry = (over = {}) => ({ id: 'bench', sets: [{ w: 60, r: 8 }], ...over })
const live = (entries, extra = {}) => ({ unit: 'kg', workouts: [], hints: {}, active: { entries, ...extra } })
const onWorkout = { screen: 'workout' }

describe('the situations', () => {
  it('a typed weight above any human lift, with no history, is noticed on the workout screen only', () => {
    const S = live([entry({ sets: [{ w: 760, r: 12 }] })])
    expect(situationsOf(S, onWorkout)).toContain('oddLoad')
    expect(situationsOf(S, { screen: 'home' })).not.toContain('oddLoad')
    expect(situationsOf(live([entry()]), onWorkout)).not.toContain('oddLoad')
  })

  it('a weight confirmed at that load is no longer a situation', () => {
    const S = live([entry({ sets: [{ w: 760, r: 12, loadOk: 760 }] })])
    expect(situationsOf(S, onWorkout)).not.toContain('oddLoad')
  })

  it('reads the progression decision: a deload, the heaviest dumbbell, a changed plan', () => {
    expect(situationsOf(live([entry({ plan: { kind: 'deload', why: ['x'] } })]), onWorkout)).toEqual(['deload'])
    expect(situationsOf(live([entry({ plan: { kind: 'hold', why: ['You’ve outgrown the rack: {0} {1} is your heaviest dumbbell, so the weight stays.', 30, 'kg'] } })]), onWorkout)).toEqual(['toppedOut'])
    expect(situationsOf(live([entry({ plan: { kind: 'hold', why: ['Plan changed, so starting from your new target.'] } })]), onWorkout)).toEqual(['planChanged'])
    expect(situationsOf(live([entry({ plan: { kind: 'hold', why: ['First time in this routine, so starting from its own target.'] } })]), onWorkout)).toEqual(['planChanged'])
    expect(situationsOf(live([entry({ plan: { kind: 'up', why: ['y'] } })]), onWorkout)).toEqual([])
  })

  it('a superset, a past workout, the first rest', () => {
    expect(situationsOf(live([entry({ sg: 'a' }), entry({ id: 'row', sg: 'a' })]), onWorkout)).toEqual(['superset'])
    expect(situationsOf(live([entry()], { backfill: true }), { screen: 'workout', resting: true })).toEqual(['backfill'])
    expect(situationsOf(live([entry()]), { screen: 'workout', resting: true })).toEqual(['firstRest'])
  })

  it('a workout being edited is not a live one', () => {
    expect(situationsOf(live([entry({ sg: 'a' })], { editingWorkoutId: 'w1' }), onWorkout)).toEqual([])
  })

  it('the first saved workout, once nothing is running, anywhere', () => {
    expect(situationsOf({ workouts: [{ id: 1 }] }, { screen: 'home' })).toEqual(['firstFinish'])
    expect(situationsOf({ workouts: [{ id: 1 }, { id: 2 }] }, { screen: 'home' })).toEqual([])
  })
})

describe('told once', () => {
  it('a moment shown is not due again, the others still are', () => {
    const S = live([entry({ sg: 'a', plan: { kind: 'deload', why: ['x'] } })])
    expect(momentFor(S, onWorkout)).toBe('deload')
    const after = { ...S, hints: withMomentSeen(S.hints, 'deload') }
    expect(momentDue(after, 'deload')).toBe(false)
    expect(momentFor(after, onWorkout)).toBe('superset')
  })

  it('writes a new map and leaves the one given untouched', () => {
    const hints = { guide: 'new' }
    const next = withMomentSeen(hints, 'superset')
    expect(next).not.toBe(hints)
    expect(hints).toEqual({ guide: 'new' })
    expect(next.moments).toEqual({ superset: true })
  })

  it('help switched off silences every moment', () => {
    const S = { ...live([entry({ sg: 'a' })]), hints: { guide: 'off', welcomed: true } }
    expect(momentFor(S, onWorkout)).toBe(null)
  })

  it('someone with training behind them still gets them: they are rare, not basics', () => {
    const S = { ...live([entry({ sg: 'a' })]), workouts: [{ id: 1 }, { id: 2 }] }
    expect(momentFor(S, onWorkout)).toBe('superset')
  })

  it('Show the tips again and the welcome replayed bring them back', () => {
    const seen = withMomentSeen({ guide: 'new' }, 'superset')
    expect(withMomentsReset(seen)).toEqual({ guide: 'new' })
    expect(withTipsReset(seen).moments).toBeUndefined()
    expect(withToursReset(seen).moments).toBeUndefined()
  })

  it('an unknown moment is never due', () => {
    expect(momentDue({}, 'nope')).toBe(false)
  })
})

describe('how long a bubble stays', () => {
  it('reading time at 3 words a second plus 1.5 s, between 5 and 14 s', () => {
    expect(momentMs('one two three')).toBe(MIN_MS)
    expect(momentMs(Array(30).fill('w').join(' '))).toBe(11500)
    expect(momentMs(Array(100).fill('w').join(' '))).toBe(MAX_MS)
  })

  it('every moment has words, short enough to read at a glance (at most 40 words)', () => {
    for (const id of MOMENT_IDS) {
      const words = MOMENTS[id].text().split(/\s+/).length
      expect(words, id).toBeGreaterThan(5)
      expect(words, id).toBeLessThanOrEqual(40)
    }
  })
})
