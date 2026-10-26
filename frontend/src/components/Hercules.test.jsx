// @vitest-environment happy-dom
// Hercules: the portrait shows on the main screens for a signed-in profile on a server that has
// him, the chat sends the conversation and shows the answer with the messages left today.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({ status: { on: true, perDay: 20, left: 20 }, sent: [], coaches: [], answer: null, off: [] }))
vi.mock('../lib/hercules.js', async orig => ({
  ...(await orig()),
  herculesStatus: vi.fn(async coach => (mocks.off.includes(coach) ? { ...mocks.status, on: false } : mocks.status)),
  askHercules: vi.fn(async (list, coach = 'hercules') => {
    mocks.sent.push(list); mocks.coaches.push(coach)
    if (mocks.answer instanceof Error) throw mocks.answer
    return mocks.answer || { reply: 'Do **3 sets** of 8.\n\n- Rest 2 min\n- Add 2.5 kg', left: 19, perDay: 20 }
  }),
}))
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import HerculesButton, { herculesSheet, resetGreetingForTests } from './Hercules.jsx'

const roots = []
const flush = () => act(() => new Promise(r => setTimeout(r, 0)))
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(el))
  return host
}
function renderTopSheet() {
  const sheet = useUI.getState().sheets.at(-1)
  return mount(sheet.render(() => useUI.getState().closeSheet(sheet.id)))
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  mocks.status = { on: true, perDay: 20, left: 20 }; mocks.sent = []; mocks.coaches = []; mocks.off = []; mocks.answer = null
  localStorage.clear()
  resetGreetingForTests()
  useUI.setState({ sheets: [] })
  useStore.setState({ S: structuredClone(DEF), user: { id: 'u' + Math.random(), name: 'Ada' }, ready: true })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { roots.splice(0).forEach(r => r.unmount()) }) })

describe('Hercules', () => {
  it('shows on Home, not without a server account, not when the server has no key', async () => {
    let host = mount(<MemoryRouter initialEntries={['/home']}><HerculesButton /></MemoryRouter>)
    await flush()
    expect(host.querySelector('.hc-fab')).not.toBeNull()

    useStore.setState({ user: null })
    host = mount(<MemoryRouter initialEntries={['/home']}><HerculesButton /></MemoryRouter>)
    await flush()
    expect(host.querySelector('.hc-fab')).toBeNull()

    mocks.status = { on: false, perDay: 20, left: 20 }
    useStore.setState({ user: { id: 'other', name: 'B' } })
    host = mount(<MemoryRouter initialEntries={['/home']}><HerculesButton /></MemoryRouter>)
    await flush()
    expect(host.querySelector('.hc-fab')).toBeNull()
  })

  it('hides during a workout', async () => {
    useStore.setState(s => ({ S: { ...s.S, active: { entries: [] } } }))
    const host = mount(<MemoryRouter initialEntries={['/workout']}><HerculesButton /></MemoryRouter>)
    await flush()
    expect(host.querySelector('.hc-fab')).toBeNull()
  })

  it('sends a suggestion and shows the answer with its formatting and what is left', async () => {
    const fab = mount(<MemoryRouter initialEntries={['/profile']}><HerculesButton /></MemoryRouter>)
    await flush()
    act(() => fab.querySelector('.hc-fab').click())
    const chat = renderTopSheet()
    await flush()
    expect(chat.textContent).toContain('Hi, I am Hercules.')
    act(() => chat.querySelector('.hc-sugg .chip').click())
    await flush(); await flush()
    expect(mocks.sent[0].at(-1)).toMatchObject({ role: 'user', content: 'Plan my training for next week' })
    expect(chat.querySelector('.hc-m.him strong').textContent).toBe('3 sets')
    expect(chat.querySelectorAll('.hc-m.him li')).toHaveLength(2)
    expect(chat.textContent).toContain('19 messages left today')
    // kept on the device for next time
    const kept = JSON.parse(localStorage.getItem('olympus_hercules_chats_' + useStore.getState().user.id))
    expect(kept.chats).toHaveLength(1)
    expect(kept.chats[0].title).toBe('Plan my training for next week')
    expect(kept.chats[0].messages.map(m => m.role)).toEqual(['user', 'assistant'])
    // his answer comes with his avatar
    expect(chat.querySelector('.hc-row .hc-av')).not.toBeNull()
  })

  it('says so when the messages for today are used up', async () => {
    mocks.answer = Object.assign(new Error('limit'), { status: 429, data: { code: 'hercules-limit' } })
    useUI.getState().openSheet(close => null)
    const { herculesSheet } = await import('./Hercules.jsx')
    useUI.setState({ sheets: [] })
    herculesSheet()
    const chat = renderTopSheet()
    await flush()
    const box = chat.querySelector('textarea')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    act(() => { setter.call(box, 'one more'); box.dispatchEvent(new Event('input', { bubbles: true })) })
    act(() => chat.querySelector('.hc-send').click())
    await flush(); await flush()
    expect(chat.querySelector('.hc-err').textContent).toContain('last message for today')
  })

  const type = (chat, text) => {
    const box = chat.querySelector('textarea')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    act(() => { setter.call(box, text); box.dispatchEvent(new Event('input', { bubbles: true })) })
    act(() => chat.querySelector('.hc-send').click())
  }

  it('keeps several conversations: start a new one, go back to the first, delete one', async () => {
    herculesSheet()
    const chat = renderTopSheet()
    await flush()
    type(chat, 'How much protein?'); await flush(); await flush()
    const menuBtn = () => chat.querySelector('[aria-label="Conversations"]')
    act(() => menuBtn().click())
    expect(chat.querySelectorAll('.hc-conv')).toHaveLength(1)
    act(() => chat.querySelector('.hc-new').click())
    expect(chat.textContent).toContain('Hi, I am Hercules.')
    type(chat, 'Fix my deadlift'); await flush(); await flush()
    act(() => menuBtn().click())
    const titles = [...chat.querySelectorAll('.hc-conv-t')].map(e => e.textContent)
    expect(titles).toEqual(['Fix my deadlift', 'How much protein?'])
    act(() => chat.querySelectorAll('.hc-conv-open')[1].click())
    expect(chat.querySelector('.hc-m.me').textContent).toBe('How much protein?')
    act(() => menuBtn().click())
    act(() => chat.querySelector('.hc-conv [aria-label="Delete conversation"]').click())
    expect([...chat.querySelectorAll('.hc-conv-t')].map(e => e.textContent)).toEqual(['How much protein?'])
    const kept = JSON.parse(localStorage.getItem('olympus_hercules_chats_' + useStore.getState().user.id))
    expect(kept.chats.map(c => c.title)).toEqual(['How much protein?'])
  })

  it('turns the one conversation older versions kept into the first of the list', async () => {
    const uid = useStore.getState().user.id
    localStorage.setItem('olympus_hercules_' + uid, JSON.stringify([{ role: 'user', content: 'Old question', ts: 1 }, { role: 'assistant', content: 'Old answer', ts: 2 }]))
    herculesSheet()
    const chat = renderTopSheet()
    await flush()
    expect(chat.querySelector('.hc-m.me').textContent).toBe('Old question')
    expect(chat.textContent).toContain('Old answer')
  })

  it('says hello from his portrait once a day, and a tap opens the chat', async () => {
    vi.useFakeTimers()
    try {
      const host = mount(<MemoryRouter initialEntries={['/home']}><HerculesButton /></MemoryRouter>)
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })
      expect(host.querySelector('.hc-fab .hc-ai').textContent).toBe('AI')
      expect(host.querySelector('.hc-bubble')).toBeNull()
      await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
      expect(host.querySelector('.hc-bubble').textContent).toContain('your AI coach')
      act(() => host.querySelector('.hc-bubble-t').click())
      expect(useUI.getState().sheets).toHaveLength(1)
      expect(host.querySelector('.hc-bubble')).toBeNull()
      // the same day, after a restart: Athena introduces herself, from her own portrait
      const restart = async () => {
        act(() => { roots.splice(0).forEach(r => r.unmount()) })
        useUI.setState({ sheets: [] })
        resetGreetingForTests()
        const host = mount(<MemoryRouter initialEntries={['/home']}><HerculesButton /></MemoryRouter>)
        await act(async () => { await vi.advanceTimersByTimeAsync(10) })
        await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
        return host
      }
      const again = await restart()
      expect(again.querySelector('.hc-bubble').textContent).toContain('I am Athena')
      expect(again.querySelector('.hc-fab').getAttribute('aria-label')).toContain('Athena')
      // and then nobody else that day
      const third = await restart()
      expect(third.querySelector('.hc-fab')).not.toBeNull()
      expect(third.querySelector('.hc-bubble')).toBeNull()
    } finally { vi.useRealTimers() }
  })

  it('Athena is the other coach: pills to switch, her own conversations, and the button remembers her', async () => {
    const uid = useStore.getState().user.id
    herculesSheet()
    const chat = renderTopSheet()
    await flush(); await flush()
    expect(chat.querySelectorAll('.hc-pill')).toHaveLength(2)
    expect(chat.querySelector('.hc-name').textContent).toBe('Hercules')
    type(chat, 'Question for Hercules'); await flush(); await flush()
    act(() => [...chat.querySelectorAll('.hc-pill')].find(b => b.textContent === 'Athena').click())
    await flush()
    expect(chat.querySelector('.hc-name').textContent).toBe('Athena')
    expect(chat.textContent).toContain('Hi, I am Athena.')
    expect(chat.textContent).toContain('Analyze my last 4 weeks of training')
    expect(chat.querySelector('.hc-m.me')).toBeNull()
    type(chat, 'Question for Athena'); await flush(); await flush()
    expect(mocks.coaches).toEqual(['hercules', 'athena'])
    expect(chat.querySelector('.hc-m.me').textContent).toBe('Question for Athena')
    expect(JSON.parse(localStorage.getItem('olympus_athena_chats_' + uid)).chats[0].title).toBe('Question for Athena')
    expect(JSON.parse(localStorage.getItem('olympus_hercules_chats_' + uid)).chats[0].title).toBe('Question for Hercules')
    expect(localStorage.getItem('olympus_coach_last_' + uid)).toBe('athena')
    // back to the first: his conversation is still his
    act(() => [...chat.querySelectorAll('.hc-pill')].find(b => b.textContent === 'Hercules').click())
    await flush()
    expect(chat.querySelector('.hc-m.me').textContent).toBe('Question for Hercules')
    // the chat is closed: the button shows the coach talked to last (Hercules was picked again)
    useUI.setState({ sheets: [] })
    const fab = mount(<MemoryRouter initialEntries={['/home']}><HerculesButton /></MemoryRouter>)
    await flush(); await flush()
    expect(fab.querySelector('.hc-fab').getAttribute('aria-label')).toContain('Hercules')
    expect(localStorage.getItem('olympus_coach_last_' + uid)).toBe('hercules')
    localStorage.setItem('olympus_coach_last_' + uid, 'athena')
    const again = mount(<MemoryRouter initialEntries={['/home']}><HerculesButton /></MemoryRouter>)
    await flush(); await flush()
    expect(again.querySelector('.hc-fab').getAttribute('aria-label')).toContain('Athena')
  })

  it('without a second coach on the server there are no pills, and Athena alone fills the button', async () => {
    mocks.off = ['hercules']
    const fab = mount(<MemoryRouter initialEntries={['/home']}><HerculesButton /></MemoryRouter>)
    await flush(); await flush()
    expect(fab.querySelector('.hc-fab').getAttribute('aria-label')).toContain('Athena')
    act(() => fab.querySelector('.hc-fab').click())
    const chat = renderTopSheet()
    await flush(); await flush()
    expect(chat.querySelector('.hc-name').textContent).toBe('Athena')
    expect(chat.querySelector('.hc-switch')).toBeNull()
  })
})
