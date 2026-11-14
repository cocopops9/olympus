// @vitest-environment happy-dom
// Messages (views/Chats.jsx): the list of conversations, and one conversation, where a message is
// sent, read, and taken back.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

const mocks = vi.hoisted(() => ({ nav: vi.fn(), id: 'u_b', chats: vi.fn(), thread: vi.fn(), send: vi.fn(), read: vi.fn(), del: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.nav, useParams: () => ({ id: mocks.id }), Navigate: () => null }))
vi.mock('../lib/social.js', async importOriginal => ({
  ...(await importOriginal()),
  socialReady: () => true,
  fetchChats: (...a) => mocks.chats(...a), fetchThread: (...a) => mocks.thread(...a), sendMessage: (...a) => mocks.send(...a),
  markChatRead: (...a) => mocks.read(...a), deleteMessage: (...a) => mocks.del(...a),
  fetchNotifications: async () => ({ unread: 0, requests: 0, items: [] }), fetchChatUnread: async () => ({ unread: 0 }),
}))
import Chats, { ChatThread } from './Chats.jsx'

const ben = { id: 'u_b', name: 'Ben' }
const NOW = Date.now()
const msg = (id, mine, text) => ({ id, mine, text, at: NOW - (10 - id) * 60000 })

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  for (const k of ['nav', 'chats', 'thread', 'send', 'read', 'del']) mocks[k].mockReset()
  mocks.read.mockResolvedValue({})
  useStore.setState({ user: { id: 'u_a', name: 'Anna' } })
  useUI.setState({ sheets: [] })
})
afterEach(() => { act(() => root.unmount()); host.remove(); useStore.setState({ user: null }); useUI.setState({ sheets: [] }) })
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })
const show = async el => { await act(async () => root.render(el)); await flush() }

describe('the list of conversations', () => {
  it('shows who wrote last and what waits unread, and opens a conversation', async () => {
    mocks.chats.mockResolvedValue({ chats: [
      { id: 'u_b', user: ben, at: NOW - 60000, text: 'See you at six', mine: false, unread: 2 },
      { id: 'u_c', user: { id: 'u_c', name: 'Cleo' }, at: NOW - 3600000, text: 'Thanks', mine: true, unread: 0 },
    ] })
    await show(<Chats />)
    const rows = host.querySelectorAll('.chat-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].classList.contains('unread')).toBe(true)
    expect(rows[0].querySelector('.chat-row-u').textContent).toBe('2')
    expect(rows[0].textContent).toContain('See you at six')
    expect(rows[1].textContent).toContain('You: Thanks')
    expect(rows[1].querySelector('.chat-row-u')).toBeNull()
    act(() => rows[0].click())
    expect(mocks.nav).toHaveBeenLastCalledWith('/chats/u_b')
  })

  it('says how to start when there is nothing yet', async () => {
    mocks.chats.mockResolvedValue({ chats: [] })
    await show(<Chats />)
    expect(host.textContent).toContain('No messages yet')
    expect(host.textContent).toContain('tap Message')
  })

  it('says so when the server has no messages', async () => {
    mocks.chats.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }))
    await show(<Chats />)
    expect(host.textContent).toContain('Messages are not available on this server yet.')
  })
})

describe('one conversation', () => {
  it('shows the messages, marks them read and tells which of yours were seen', async () => {
    mocks.thread.mockResolvedValue({ user: ben, messages: [msg(1, true, 'Gym at six?'), msg(2, true, 'Legs today'), msg(3, false, 'I am in')], more: false, seen: 1 })
    await show(<ChatThread />)
    const bubbles = host.querySelectorAll('.chat-m')
    expect([...bubbles].map(b => b.querySelector('.chat-m-t').textContent)).toEqual(['Gym at six?', 'Legs today', 'I am in'])
    expect(bubbles[0].classList.contains('me')).toBe(true)
    expect(bubbles[2].classList.contains('them')).toBe(true)
    expect(bubbles[0].querySelector('.chat-seen')).toBeTruthy()
    expect(bubbles[1].querySelector('.chat-seen')).toBeNull()
    expect(bubbles[2].querySelector('.chat-m-x')).toBeNull()
    expect(mocks.read).toHaveBeenCalledWith('u_b')
    expect(host.querySelector('.chat-peer').textContent).toContain('Ben')
  })

  it('sends what was written and shows it at once', async () => {
    mocks.thread.mockResolvedValue({ user: ben, messages: [], more: false, seen: 0 })
    mocks.send.mockResolvedValue({ message: msg(1, true, 'Hello Ben') })
    await show(<ChatThread />)
    expect(host.textContent).toContain('Say hi to Ben.')
    const box = host.querySelector('textarea')
    expect(host.querySelector('.chat-send').disabled).toBe(true)
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    await act(async () => { setter.call(box, '  Hello Ben '); box.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await flush()
    expect(mocks.send).toHaveBeenCalledWith('u_b', 'Hello Ben')
    expect(host.querySelector('.chat-m.me .chat-m-t').textContent).toBe('Hello Ben')
    expect(host.querySelector('textarea').value).toBe('')
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('takes a message back only after asking', async () => {
    mocks.thread.mockResolvedValue({ user: ben, messages: [msg(1, true, 'Oops')], more: false, seen: 0 })
    mocks.del.mockResolvedValue({})
    await show(<ChatThread />)
    act(() => host.querySelector('.chat-m-x').click())
    expect(mocks.del).not.toHaveBeenCalled()
    expect(useUI.getState().sheets).toHaveLength(1)
  })

  it('loads earlier messages above the ones on screen', async () => {
    mocks.thread.mockImplementation(async (id, before) => (before
      ? { user: ben, messages: [msg(1, false, 'First')], more: false, seen: 0 }
      : { user: ben, messages: [msg(2, true, 'Second')], more: true, seen: 0 }))
    await show(<ChatThread />)
    const olderBtn = host.querySelector('.chat-older')
    await act(async () => olderBtn.click()); await flush()
    expect(mocks.thread).toHaveBeenLastCalledWith('u_b', 2)
    expect([...host.querySelectorAll('.chat-m-t')].map(x => x.textContent)).toEqual(['First', 'Second'])
    expect(host.querySelector('.chat-older')).toBeNull()
  })

  it('explains why someone cannot be written to', async () => {
    mocks.thread.mockRejectedValue(Object.assign(new Error('blocked'), { status: 403, code: 'blocked' }))
    await show(<ChatThread />)
    expect(host.textContent).toContain('You blocked this person. Unblock them to write.')
    expect(host.querySelector('textarea')).toBeNull()
  })
})
