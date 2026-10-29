// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { loadMemory, chatsOf, putChatsOf, forgetCoach, memoryLines } from './coach-memory.js'

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
