// The title an unnamed workout gets (lib/workout-title.js): the muscles trained and the emoji
// of what that training was, never random.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { autoTitle, titleWorkout, isUntitled, cardioKind, EMOJI } from './workout-title.js'

const sets = n => Array.from({ length: n }, () => ({ w: 40, r: 10, done: true }))
const w = (id, list) => ({ id, name: 'Freestyle', entries: list.map(([ex, n]) => ({ id: ex, sets: sets(n) })) })
const BENCH = '0025', PUSHDOWN = '0201', RAISE = '0334', RUN = '0685', HAM_STRETCH = '0789', CHILD = '0945', SQUAT = '0043'

describe('workout titles', () => {
  it('knows which names are no title', () => {
    expect(isUntitled('')).toBe(true)
    expect(isUntitled('  ')).toBe(true)
    expect(isUntitled('Freestyle')).toBe(true)
    expect(isUntitled('Push day')).toBe(false)
  })

  it('a push workout: the muscles, the weightlifter for the chest and the biceps for the arms', () => {
    const title = autoTitle(w('a1', [[BENCH, 4], [PUSHDOWN, 3]]))
    expect(title).toMatch(/Chest/)
    expect(title).toMatch(/Triceps/)
    expect(title).toContain(EMOJI.lift)
    expect(title).toContain(EMOJI.arms)
  })

  it('shoulders get the weightlifter, legs the leg', () => {
    expect(autoTitle(w('s1', [[RAISE, 4]]))).toBe('Shoulders ' + EMOJI.lift)
    expect(autoTitle(w('l1', [[SQUAT, 5]]))).toContain(EMOJI.legs)
  })

  it('is never random: two workouts of the same exercises get the same title', () => {
    expect(autoTitle(w('one', [[BENCH, 4], [RAISE, 4]]))).toBe(autoTitle(w('two', [[BENCH, 4], [RAISE, 4]])))
  })

  it('cardio by its activity, and stretching', () => {
    expect(autoTitle(w('c', [[RUN, 1]]))).toBe('Cardio ' + EMOJI.run)
    expect(autoTitle(w('m', [[BENCH, 4], [RUN, 1]]))).toContain(EMOJI.run)
    expect(autoTitle(w('m', [[BENCH, 4], [RUN, 1]]))).not.toMatch(/Quads/)
    expect(autoTitle(w('st', [[HAM_STRETCH, 2], [CHILD, 2]]))).toBe('Stretching ' + EMOJI.stretch)
  })

  it('tells the cardio activities apart', () => {
    const kind = n => cardioKind({ n })
    expect(kind('run on treadmill')).toBe('run')
    expect(kind('walking on treadmill')).toBe('walk')
    expect(kind('stationary bike run v. 3')).toBe('bike')
    expect(kind('rowing (with rowing machine)')).toBe('row')
    expect(kind('swimming crawl style')).toBe('swim')
    expect(kind('burpee')).toBe('jump')
    expect(kind('boxer shuffle')).toBe('box')
  })

  it('keeps a name somebody gave, and a workout it cannot read', () => {
    expect(titleWorkout({ ...w('n', [[BENCH, 3]]), name: 'Push day' }).name).toBe('Push day')
    expect(titleWorkout({ id: 'x', name: 'Freestyle', entries: [{ id: 'nope', sets: sets(2) }] }).name).toBe('Freestyle')
    expect(titleWorkout(w('t', [[BENCH, 3]])).name).toMatch(/^Chest /)
  })

  it('keeps the source plain ASCII: the emoji are escapes', () => {
    const src = fs.readFileSync(new URL('./workout-title.js', import.meta.url), 'utf8')
    expect(/[^\x00-\x7f]/.test(src)).toBe(false)
  })
})
