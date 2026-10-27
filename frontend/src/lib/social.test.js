import { describe, expect, it } from 'vitest'
import { workoutPostSummary, initialsOf, hueOf, socialReady, socialErrorText, fitWithin, followLabel, notificationLine } from './social.js'

// What a post says about a workout. The server keeps only these fields (api/social.js
// cleanWorkout), so this is the whole of what other people get to see of a session.
describe('workoutPostSummary', () => {
  const names = { bench: 'Bench press', curl: 'Dumbbell curl', lunge: 'Dumbbell lunge', skip: 'Skipped' }
  const nameOf = e => names[e.id] || e.id
  const w = {
    id: 'w1', d: '2026-10-20', start: 0, end: 62 * 60000, name: 'Push', vol: 1790.04,
    prs: ['bench'],
    entries: [
      { id: 'bench', target: { mode: 'reps' }, sets: [
        { w: 40, r: 8, done: true, phase: 'warmup' },
        { w: 60, r: 8, done: true },
        { w: 65, r: 5, done: true },
        { w: 70, r: 3, done: false },
      ] },
      { id: 'curl', target: { mode: 'reps' }, sets: [{ w: 12, r: 10, done: true }, { w: 12, r: 12, done: true }] },
      { id: 'lunge', target: { mode: 'reps', side: true }, sets: [
        { w: 10, r: 16, done: true, sides: { L: { w: 10, r: 8, done: true }, R: { w: 10, r: 8, done: true } } },
      ] },
      { id: 'skip', target: { mode: 'reps' }, sets: [{ w: 20, r: 10, done: false }] },
    ],
  }

  it('counts work sets only, per side for a unilateral set, and names the best set', () => {
    const s = workoutPostSummary(w, { unit: 'kg', nameOf })
    expect(s.name).toBe('Push')
    expect(s.d).toBe('2026-10-20')
    expect(s.durMs).toBe(62 * 60000)
    expect(s.vol).toBe(1790)
    expect(s.prs).toBe(1)
    // bench 2 work sets (the warm-up and the unticked one left out), curl 2, lunge 2 sides.
    expect(s.sets).toBe(6)
    expect(s.exercises.map(e => [e.n, e.sets])).toEqual([['Bench press', 2], ['Dumbbell curl', 2], ['Dumbbell lunge', 2]])
    // The heaviest set wins over the one with more reps; equal load, more reps wins.
    expect(s.exercises[0].best).toMatch(/65\s*×\s*5/)
    expect(s.exercises[1].best).toMatch(/12\s*×\s*12/)
  })

  it('leaves out an exercise with nothing done, and never carries the sets themselves', () => {
    const s = workoutPostSummary(w, { nameOf })
    expect(s.exercises.some(e => e.n === 'Skipped')).toBe(false)
    expect(JSON.stringify(s)).not.toContain('"done"')
    expect(Object.keys(s).sort()).toEqual(['d', 'durMs', 'exercises', 'name', 'prs', 'sets', 'unit', 'vol'])
  })

  it('reads an empty or partial record without throwing', () => {
    const s = workoutPostSummary({ name: 'Imported', d: '2026-01-02' })
    expect(s).toMatchObject({ name: 'Imported', sets: 0, exercises: [], prs: 0, unit: 'kg' })
    expect(workoutPostSummary({ entries: [] }, { unit: 'lb' }).unit).toBe('lb')
  })

  it('keeps at most twenty exercises', () => {
    const many = { name: 'Long', entries: Array.from({ length: 30 }, (_, i) => ({ id: 'e' + i, target: { mode: 'reps' }, sets: [{ w: 5, r: 5, done: true }] })) }
    expect(workoutPostSummary(many).exercises).toHaveLength(20)
    expect(workoutPostSummary(many).sets).toBe(30)
  })
})

describe('avatars and readiness', () => {
  it('takes initials from the first and last word', () => {
    expect(initialsOf('Giuseppe D’Auria')).toBe('GD')
    expect(initialsOf('anna')).toBe('AN')
    expect(initialsOf('  ')).toBe('?')
  })
  it('gives the same id the same hue, inside the circle', () => {
    expect(hueOf('u_1')).toBe(hueOf('u_1'))
    expect(hueOf('u_1')).toBeGreaterThanOrEqual(0)
    expect(hueOf('u_1')).toBeLessThan(360)
  })
  it('needs a server profile', () => {
    expect(socialReady(null)).toBe(false)
    expect(socialReady({ id: 'x', name: 'A' })).toBe(true)
  })
  it('explains the failures a person can act on', () => {
    const t = s => s
    expect(socialErrorText({ status: 429 }, t)).toMatch(/too many posts/)
    expect(socialErrorText({ code: 'not-paired', status: 0 }, t)).toMatch(/Connect to the internet/)
    expect(socialErrorText({ message: 'boom', status: 500 }, t)).toBe('boom')
  })
})

describe('photo sizing', () => {
  it('keeps the proportions and caps the longer side', () => {
    expect(fitWithin(4000, 3000)).toEqual({ w: 1600, h: 1200 })
    expect(fitWithin(3000, 4000)).toEqual({ w: 1200, h: 1600 })
    expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 })   // never enlarged
    expect(fitWithin(5000, 10, 1600)).toEqual({ w: 1600, h: 3 })
    expect(fitWithin(0, 0)).toEqual({ w: 1, h: 1 })
  })
})

describe('labels', () => {
  const t = (s, ...a) => a.reduce((x, v, i) => x.replace('{' + i + '}', v), s)
  it('says Following, Requested or Follow', () => {
    expect(followLabel({ isFollowing: true }, t)).toBe('Following')
    expect(followLabel({ requested: true }, t)).toBe('Requested')
    expect(followLabel({}, t)).toBe('Follow')
  })
  it('words every kind of notification with who did it', () => {
    const from = { id: 'b', name: 'Ben' }
    expect(notificationLine({ kind: 'like', from }, t)).toBe('Ben liked your post')
    expect(notificationLine({ kind: 'comment', from, text: 'huge' }, t)).toBe('Ben commented: huge')
    expect(notificationLine({ kind: 'comment', from }, t)).toBe('Ben commented on your post')
    expect(notificationLine({ kind: 'follow', from }, t)).toBe('Ben started following you')
    expect(notificationLine({ kind: 'request', from }, t)).toBe('Ben wants to follow you')
    expect(notificationLine({ kind: 'accepted', from }, t)).toBe('Ben accepted your follow request')
  })
  it('explains photo and privacy refusals', () => {
    const t1 = s => s
    expect(socialErrorText({ code: 'photo-too-large', status: 413 }, t1)).toMatch(/too large/)
    expect(socialErrorText({ code: 'private', status: 403 }, t1)).toMatch(/private/)
    expect(socialErrorText({ code: 'blocked', status: 409 }, t1)).toMatch(/Unblock/)
  })
})
