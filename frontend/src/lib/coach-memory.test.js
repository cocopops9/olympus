// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
const sent = vi.hoisted(() => ({ calls: [], answer: null }))
vi.mock('./api.js', () => ({ api: vi.fn(async (path, init) => { sent.calls.push({ path, body: JSON.parse(init.body) }); return sent.answer }) }))
import { loadMemory, chatsOf, putChatsOf, forgetCoach, memoryLines, loadNotes, addNote, editNote, deleteNote, loadHidden, dataNotes, memoryContext, distillMemory } from './coach-memory.js'

const msg = (role, content, ts) => ({ role, content, ts })
const DAY = 86400000

describe('one memory for every coach', () => {
  beforeEach(() => localStorage.clear())

  it('folds the per-coach stores of older versions into one, and removes them', () => {
    localStorage.setItem('olympus_hercules_chats_u1', JSON.stringify({ current: 'h1', chats: [{ id: 'h1', ts: 10, title: 'Squat', messages: [msg('user', 'My knee hurts on squats', 9)] }] }))
    localStorage.setItem('olympus_athena_chats_u1', JSON.stringify({ current: 'a1', chats: [{ id: 'a1', ts: 20, title: 'Plan', messages: [msg('user', 'I train 3 days', 19)] }] }))
    const mem = loadMemory('u1')
    expect(mem.chats.map(c => [c.id, c.coach]).sort()).toEqual([['a1', 'athena'], ['h1', 'hercules']])
    expect(localStorage.getItem('olympus_hercules_chats_u1')).toBe(null)
    expect(localStorage.getItem('olympus_athena_chats_u1')).toBe(null)
    expect(chatsOf('u1', 'athena')).toMatchObject({ current: 'a1', chats: [{ id: 'a1', title: 'Plan' }] })
  })

  it('turns the single conversation of the oldest versions into Hercules\'s first', () => {
    localStorage.setItem('olympus_hercules_u1', JSON.stringify([msg('user', 'Old question', 1), msg('assistant', 'Old answer', 2)]))
    expect(chatsOf('u1', 'hercules').chats[0].messages.map(m => m.content)).toEqual(['Old question', 'Old answer'])
    expect(localStorage.getItem('olympus_hercules_u1')).toBe(null)
  })

  it('keeps each coach\'s list its own, in the one store', () => {
    putChatsOf('u1', 'hercules', { current: 'h1', chats: [{ id: 'h1', ts: 5, title: 'A', messages: [msg('user', 'a', 5)] }] })
    putChatsOf('u1', 'chiron', { current: 'c1', chats: [{ id: 'c1', ts: 6, title: 'B', messages: [msg('user', 'b', 6)] }] })
    putChatsOf('u1', 'hercules', { current: null, chats: [] })
    expect(chatsOf('u1', 'hercules').chats).toEqual([])
    expect(chatsOf('u1', 'chiron').chats.map(c => c.id)).toEqual(['c1'])
    forgetCoach('u1', 'chiron')
    expect(chatsOf('u1', 'chiron').chats).toEqual([])
  })

  it('gives every coach what was said to any of them lately, newest first, their words only', () => {
    const now = 100 * DAY
    putChatsOf('u1', 'hercules', { current: 'h1', chats: [{ id: 'h1', ts: now - DAY, title: '', messages: [msg('user', 'My left knee hurts on deep squats', now - DAY), msg('assistant', 'Try box squats', now - DAY + 1)] }] })
    putChatsOf('u1', 'athena', { current: 'a1', chats: [{ id: 'a1', ts: now - 2 * DAY, title: '', messages: [msg('user', 'Powerlifting meet on December 12', now - 2 * DAY)] }] })
    putChatsOf('u1', 'chiron', { current: 'c0', chats: [{ id: 'c0', ts: now - 90 * DAY, title: '', messages: [msg('user', 'Too old to matter', now - 90 * DAY)] }] })
    const lines = memoryLines('u1', { now })
    expect(lines[0]).toMatch(/^WHAT THEY TOLD THEIR COACHES RECENTLY/)
    expect(lines.slice(1)).toEqual([
      expect.stringContaining('to Hercules: "My left knee hurts on deep squats"'),
      expect.stringContaining('to Athena: "Powerlifting meet on December 12"'),
    ])
    expect(lines.join('\n')).not.toContain('box squats')
    expect(memoryLines('u2', { now })).toEqual([])
    // The conversation already being sent is not repeated in the digest.
    expect(memoryLines('u1', { now, skipChat: 'h1' }).join('\n')).not.toContain('knee')
  })
})

describe('two memories: theirs to edit, the app\'s own hidden', () => {
  beforeEach(() => { localStorage.clear(); sent.calls = []; sent.answer = null })
  const DAYMS = 86400000

  it('keeps their notes: add, edit (then theirs), delete', () => {
    addNote('u1', '  Has a home gym  ')
    addNote('u1', 'has a home gym')
    expect(loadNotes('u1').map(n => [n.text, n.by])).toEqual([['Has a home gym', 'you']])
    const id = loadNotes('u1')[0].id
    editNote('u1', id, 'Has a home gym with a rack')
    expect(loadNotes('u1')[0].text).toBe('Has a home gym with a rack')
    deleteNote('u1', id)
    expect(loadNotes('u1')).toEqual([])
  })

  it('distils what was said into notes and hidden insights, never rewriting their own notes', async () => {
    const now = 10 * DAYMS
    addNote('u1', 'Hates burpees', now - 3 * DAYMS)
    putChatsOf('u1', 'hercules', { current: 'h1', chats: [{ id: 'h1', ts: now - DAYMS, title: '', messages: [msg('user', 'I can train only Mondays and Thursdays', now - DAYMS), msg('assistant', 'OK', now - DAYMS + 1), msg('user', 'My goal is a 140 kg squat by June', now - DAYMS + 2)] }] })
    sent.answer = { notes: ['Trains Mondays and Thursdays', 'Wants to squat 140 kg by June', 'hates burpees'], insights: ['Plans ahead and likes numbers'] }
    expect(await distillMemory('u1', { workouts: [], bodyweight: [] }, { now })).toBe(true)
    expect(sent.calls[0].path).toBe('/api/coach/memory')
    expect(sent.calls[0].body.messages.map(m => m.content)).toEqual(['I can train only Mondays and Thursdays', 'My goal is a 140 kg squat by June'])
    expect(sent.calls[0].body.notes).toEqual(['Hates burpees'])
    expect(loadNotes('u1').map(n => [n.text, n.by])).toEqual([['Hates burpees', 'you'], ['Trains Mondays and Thursdays', 'chat'], ['Wants to squat 140 kg by June', 'chat']])
    expect(loadHidden('u1').insights).toEqual(['Plans ahead and likes numbers'])
    // Nothing new said: nothing asked.
    expect(await distillMemory('u1', {}, { now: now + DAYMS })).toBe(false)
    expect(sent.calls).toHaveLength(1)
  })

  it('reads the trends in their numbers', () => {
    const now = Date.parse('2026-10-29')
    const iso = d => new Date(now - d * DAYMS).toISOString().slice(0, 10)
    const w = (daysAgo, wt) => ({ d: iso(daysAgo), start: now - daysAgo * DAYMS - 3600000, end: now - daysAgo * DAYMS, entries: [{ id: 'squat', sets: [{ w: wt, r: 5, done: true }] }] })
    const S = { unit: 'kg', bodyweight: [{ d: iso(90), w: 80 }, { d: iso(30), w: 78 }, { d: iso(0), w: 77 }], workouts: [w(50, 100), w(40, 100), w(10, 105), w(3, 110)] }
    const lines = dataNotes(S, now)
    expect(lines[0]).toMatch(/^Body weight 77 kg, in 4 weeks -1 kg, in 12 weeks -3 kg/)
    expect(lines[1]).toMatch(/^Trains 0.5 times a week over the last 8 weeks, about 60 min a session/)
    expect(lines[2]).toMatch(/squat 116.7 kg to 128.3 kg \(\+10%\)/)
  })

  it('gives every coach both memories, the hidden one marked never to be quoted', () => {
    addNote('u1', 'Hates burpees')
    localStorage.setItem('olympus_memory_hidden_u1', JSON.stringify({ insights: ['Gets anxious before heavy singles'], ts: 1, upTo: 1 }))
    const ctx = memoryContext('u1', { workouts: [], bodyweight: [] }).join('\n')
    expect(ctx).toMatch(/THEIR MEMORY[^\n]*\n- Hates burpees/)
    expect(ctx).toMatch(/never quote or mention them\):\n- Gets anxious before heavy singles/)
  })
})
