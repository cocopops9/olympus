// The title an unnamed workout gets (lib/workout-title.js).
import { describe, expect, it } from 'vitest'
import { autoTitle, titleWorkout, isUntitled, MUSCLE_EMOJI } from './workout-title.js'

const sets = n => Array.from({ length: n }, () => ({ w: 40, r: 10, done: true }))
const w = (id, list) => ({ id, name: 'Freestyle', entries: list.map(([ex, n]) => ({ id: ex, sets: sets(n) })) })
const BENCH = '0025', PUSHDOWN = '0201', RAISE = '0334', RUN = '0685', HAM_STRETCH = '0789', CHILD = '0945'
const emojiOf = m => MUSCLE_EMOJI[m]

describe('workout titles', () => {
  it('knows which names are no title', () => {
    expect(isUntitled('')).toBe(true)
    expect(isUntitled('  ')).toBe(true)
    expect(isUntitled('Freestyle')).toBe(true)
    expect(isUntitled('Push day')).toBe(false)
  })

  it('names a workout after the muscles it trained most, each with one of its emoji', () => {
    const title = autoTitle(w('a1', [[BENCH, 4], [PUSHDOWN, 3]]))
    expect(title).toMatch(/^(Chest|Triceps)\b/)
    expect(title).toMatch(/Chest/)
    expect(title).toMatch(/Triceps/)
    expect(emojiOf('chest').some(e => title.includes(e))).toBe(true)
    expect(emojiOf('triceps').some(e => title.includes(e))).toBe(true)
  })

  it('gives a shoulder workout a shoulder emoji', () => {
    const title = autoTitle(w('s1', [[RAISE, 4]]))
    expect(title.startsWith('Shoulders ')).toBe(true)
    expect(emojiOf('deltoids').some(e => title.includes(e))).toBe(true)
  })

  it('is the same title every time for the same workout', () => {
    const a = w('same', [[BENCH, 4], [RAISE, 4]])
    expect(autoTitle(a)).toBe(autoTitle({ ...a }))
  })

  it('calls cardio and stretching by their name', () => {
    expect(autoTitle(w('c', [[RUN, 1]]))).toMatch(/^Cardio /)
    // cardio after lifting adds its emoji, not leg muscles
    expect(autoTitle(w('m', [[BENCH, 4], [RUN, 1]]))).not.toMatch(/Quads/)
    expect(autoTitle(w('st', [[HAM_STRETCH, 2], [CHILD, 2]]))).toMatch(/^Stretching /)
  })

  it('keeps a name somebody gave, and a workout it cannot read', () => {
    expect(titleWorkout({ ...w('n', [[BENCH, 3]]), name: 'Push day' }).name).toBe('Push day')
    expect(titleWorkout({ id: 'x', name: 'Freestyle', entries: [{ id: 'nope', sets: sets(2) }] }).name).toBe('Freestyle')
    expect(titleWorkout(w('t', [[BENCH, 3]])).name).toMatch(/^Chest /)
  })

  it('keeps the source plain ASCII: the emoji are escapes', async () => {
    const fs = await import('node:fs')
    const src = fs.readFileSync(new URL('./workout-title.js', import.meta.url), 'utf8')
    expect(/[^\x00-\x7f]/.test(src)).toBe(false)
  })
})
