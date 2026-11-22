// @vitest-environment happy-dom
// The app guide (components/AppGuide.jsx): the page of topics, a topic one step at a time with
// its demos, what is remembered as read, and "Show me" opening the real screen.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const voice = vi.hoisted(() => ({ speak: vi.fn(() => Promise.resolve()), stopSpeaking: vi.fn(() => Promise.resolve()), preloadVoice: vi.fn(), warmVoice: vi.fn(), canListen: vi.fn(() => Promise.resolve(false)) }))
vi.mock('../lib/voice.js', async orig => ({ ...(await orig()), ...voice }))
const api = vi.hoisted(() => vi.fn(() => Promise.resolve({ reply: 'Ok.', left: 9 })))
vi.mock('../lib/api.js', async orig => ({ ...(await orig()), api }))

import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import AppGuide, { openTopic } from './AppGuide.jsx'
import { TOPICS } from '../lib/app-guide.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const clone = v => JSON.parse(JSON.stringify(v))

let root, host
function Sheet() {
  const sheets = useUI(s => s.sheets)
  const top = sheets.at(-1)
  return top ? top.render(() => useUI.getState().closeSheet(top.id)) : null
}
function show() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<><AppGuide /><Sheet /></>))
}
const click = el => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const stepText = () => host.querySelector('.ag-text')?.textContent

beforeEach(() => {
  vi.useFakeTimers()
  useUI.setState({ sheets: [] })
  useStore.setState({ S: clone(DEF), user: null })
  window.location.hash = '#/settings/guide'
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })

describe('the page', () => {
  it('shows every topic, how many are read, and where to start', () => {
    show()
    expect(host.querySelectorAll('.ag-topic').length).toBe(TOPICS.length)
    expect(host.textContent).toContain(`0 of ${TOPICS.length} topics explored`)
    expect(button('Start with: Getting around')).toBeTruthy()
  })

  it('filters the topics as you type', () => {
    show()
    const input = host.querySelector('.ag-search input')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'hevy')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect([...host.querySelectorAll('.ag-topic')].map(b => b.dataset.topic)).toEqual(['data'])
  })
})

describe('a topic', () => {
  it('goes step by step, and counts as read once its last step is reached', () => {
    show()
    click(host.querySelector('[data-topic="plan"]'))
    const steps = TOPICS.find(x => x.id === 'plan').steps()
    expect(stepText()).toBe(steps[0].text)
    expect(host.textContent).toContain(`Step 1 of ${steps.length}`)
    expect(useStore.getState().S.hints?.guideRead?.plan).toBeFalsy()
    for (let i = 1; i < steps.length; i++) click(button('Next'))
    expect(stepText()).toBe(steps.at(-1).text)
    expect(useStore.getState().S.hints.guideRead.plan).toBe(true)
    click(button('Back'))
    expect(stepText()).toBe(steps.at(-2).text)
  })

  it('lets you try logging a set: the tick starts the rest timer, and it counts down', () => {
    show()
    act(() => openTopic('log'))
    expect(host.querySelector('.ag-set.done')).toBe(null)
    click(host.querySelector('.ag-spin button[aria-label="More"]'))
    expect(host.querySelector('.ag-spin b').textContent).toBe('62.5')
    click(host.querySelector('.ag-tick'))
    expect(host.querySelector('.ag-set.done')).not.toBe(null)
    expect(host.querySelector('.ag-say').textContent).toContain('1:30')
    act(() => { vi.advanceTimersByTime(3000) })
    expect(host.querySelector('.ag-say').textContent).toContain('1:27')
    // nothing of the demo reaches the profile
    expect(useStore.getState().S.workouts).toEqual(DEF.workouts)
  })

  it('lets you mark a set as a warm-up from its number', () => {
    show()
    act(() => openTopic('log'))
    click(button('Next'))
    click(host.querySelector('.ag-set-n.tap'))
    click([...host.querySelectorAll('.ag-menu button')].find(b => b.textContent.includes('Make it a warm-up set')))
    expect(host.querySelector('.ag-tag').textContent).toBe('Warm-up')
  })

  it('reads the step aloud on a tap of the speaker, in her voice, even with her voice off', () => {
    useStore.setState({ S: { ...clone(DEF), hints: { calliopeMute: true } } })
    show()
    act(() => openTopic('basics'))
    click(host.querySelector('.ag-sheet-h .guide-tip-say'))
    expect(voice.speak).toHaveBeenCalledWith(stepText(), expect.objectContaining({ who: 'calliope' }))
  })

  it('"Show me" closes the guide and opens the screen it is about', () => {
    show()
    act(() => openTopic('library'))
    for (let i = 1; i < TOPICS.find(x => x.id === 'library').steps().length; i++) click(button('Next'))
    click(button('Show me in the app'))
    expect(useUI.getState().sheets.length).toBe(0)
    expect(window.location.hash).toBe('#/library')
  })

  it('offers the next topic at the end', () => {
    show()
    act(() => openTopic('basics'))
    for (let i = 1; i < TOPICS[0].steps().length; i++) click(button('Next'))
    click(button(`Next topic: ${TOPICS[1].title()}`))
    expect(stepText()).toBe(TOPICS[1].steps()[0].text)
  })
})
