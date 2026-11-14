// @vitest-environment happy-dom
// The welcome (components/Welcome.jsx, components/Calliope.jsx): Calliope asks one question, and
// the answer decides how much help the screens give: out in one tap for whoever knows apps like
// this, a short tour for a newcomer, with a way out of every bubble.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const voice = vi.hoisted(() => ({ speak: vi.fn(() => Promise.resolve()), stopSpeaking: vi.fn(() => Promise.resolve()), preloadVoice: vi.fn(), warmVoice: vi.fn() }))
vi.mock('../lib/voice.js', async orig => ({ ...(await orig()), ...voice }))
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))

import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { welcomeSheet, WelcomeTour } from './Welcome.jsx'
import { useCalliope, useScreenTour } from './Calliope.jsx'
import { Tip } from './Guide.jsx'
import { tipVisible } from '../lib/guide.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const clone = v => JSON.parse(JSON.stringify(v))

let root, host
function show(node) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(node))
}
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text))
const stepOf = () => host.querySelector('.cal-tour')?.dataset.step

beforeEach(() => {
  vi.useFakeTimers()
  Object.values(voice).forEach(f => f.mockClear())
  useUI.setState({ sheets: [] })
  useCalliope.setState({ tour: null })
  useStore.setState({ S: clone(DEF), user: null })
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })

// Lets the line finish writing itself, so Next moves on.
const settle = () => act(() => { vi.advanceTimersByTime(8000) })

describe('welcome', () => {
  it('opens with Calliope asking how much help the person wants, aloud', () => {
    show(<WelcomeTour />)
    expect(host.querySelector('.cal-tour')).toBe(null)
    act(() => welcomeSheet())
    expect(stepOf()).toBe('ask')
    expect(host.querySelectorAll('[data-level]').length).toBe(3)
    expect(voice.speak).toHaveBeenCalledWith(expect.stringContaining('Calliope'), expect.objectContaining({ who: 'calliope', keep: true }))
  })

  it('someone who has used apps like this hears one thing, where to find her, and is out', () => {
    const then = vi.fn()
    show(<WelcomeTour />)
    act(() => welcomeSheet(then))
    act(() => host.querySelector('[data-level="some"]').click())
    expect(useStore.getState().S.hints).toMatchObject({ guide: 'some', welcomed: true })
    expect(stepOf()).toBe('where')
    expect(button('Skip the tour')).toBeUndefined()
    settle()
    act(() => button('Got it').click())
    expect(host.querySelector('.cal-tour')).toBe(null)
    expect(then).toHaveBeenCalledTimes(1)
    const S = useStore.getState().S
    expect(tipVisible(S, 'workoutStart')).toBe(false)
    expect(tipVisible(S, 'stats')).toBe(true)
  })

  it('whoever knows their way around is out in one tap, with no help', () => {
    const then = vi.fn()
    show(<WelcomeTour />)
    act(() => welcomeSheet(then))
    act(() => host.querySelector('[data-level="off"]').click())
    expect(host.querySelector('.cal-tour')).toBe(null)
    expect(useStore.getState().S.hints.guide).toBe('off')
    expect(then).toHaveBeenCalled()
    expect(voice.stopSpeaking).toHaveBeenCalled()
  })

  it('a newcomer is told how she helps, then shown Home only: the rest waits for each screen', () => {
    show(<WelcomeTour />)
    act(() => welcomeSheet())
    act(() => host.querySelector('[data-level="new"]').click())
    expect(stepOf()).toBe('intro')
    expect(host.querySelector('.cal-say .cal-sr').textContent).toContain('first time you open each part')
    expect(voice.preloadVoice).toHaveBeenCalled()
    const hints = useStore.getState().S.hints
    expect(hints.tours).toEqual({ home: true })
    // Steps whose button is not on screen (the tab bar is not mounted here) are left out.
    const ids = []
    for (let i = 0; i < 10 && host.querySelector('.cal-tour'); i++) { ids.push(stepOf()); settle(); act(() => host.querySelector('.cal-nav .btn.primary').click()) }
    expect(ids[0]).toBe('intro')
    expect(ids).not.toContain('plan')
    expect(ids.length).toBeLessThanOrEqual(6)
    expect(host.querySelector('.cal-tour')).toBe(null)
  })

  it('a first tap on Next only finishes the line being written', () => {
    show(<WelcomeTour />)
    act(() => welcomeSheet())
    act(() => host.querySelector('[data-level="new"]').click())
    document.body.insertAdjacentHTML('beforeend', '<nav id="tabbar"><button></button><button class="start"></button><button></button></nav>')
    act(() => button('Next').click())
    expect(stepOf()).toBe('intro')
    act(() => button('Next').click())
    expect(stepOf()).not.toBe('intro')
    document.getElementById('tabbar').remove()
  })

  it('can be left at any point, and stays answered', () => {
    const then = vi.fn()
    show(<WelcomeTour />)
    act(() => welcomeSheet(then))
    act(() => host.querySelector('[data-level="new"]').click())
    act(() => button('Skip the tour').click())
    expect(host.querySelector('.cal-tour')).toBe(null)
    expect(useStore.getState().S.hints.guide).toBe('new')
    expect(then).toHaveBeenCalledTimes(1)
  })

  it('her voice is switched off with one tap, and that is remembered', () => {
    show(<WelcomeTour />)
    act(() => welcomeSheet())
    act(() => host.querySelector('.cal-voice').click())
    expect(useStore.getState().S.hints.calliopeMute).toBe(true)
    expect(voice.stopSpeaking).toHaveBeenCalled()
    voice.speak.mockClear()
    act(() => host.querySelector('[data-level="new"]').click())
    expect(voice.speak).not.toHaveBeenCalled()
    expect(host.querySelector('.cal-voice').getAttribute('aria-pressed')).toBe('false')
  })
})

describe('a screen’s own tour', () => {
  function Screen({ ready = true }) {
    useScreenTour('plan', ready)
    return <div><div className="plan-views">views</div><div className="plan-mode">mode</div></div>
  }
  beforeEach(() => { useCalliope.setState({ inTests: true }) })
  afterEach(() => { useCalliope.setState({ inTests: false }) })

  it('starts the first time the screen opens, points at its parts, and never again', () => {
    useStore.setState({ S: { ...clone(DEF), hints: { guide: 'new', welcomed: true } } })
    show(<><Screen /><WelcomeTour /></>)
    expect(host.querySelector('.cal-tour')).toBe(null)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(host.querySelector('.cal-tour').dataset.tourOf).toBe('plan')
    expect(stepOf()).toBe('views')
    expect(useStore.getState().S.hints.tours.plan).toBe(true)
    settle()
    act(() => button('Next').click())
    expect(stepOf()).toBe('mode')
    settle()
    act(() => button('Got it').click())
    expect(host.querySelector('.cal-tour')).toBe(null)
    act(() => root.render(<><WelcomeTour /></>))
    act(() => root.render(<><Screen /><WelcomeTour /></>))
    act(() => { vi.advanceTimersByTime(5000) })
    expect(host.querySelector('.cal-tour')).toBe(null)
  })

  it('waits while a sheet is open, and does not start for whoever asked for no help', () => {
    useStore.setState({ S: { ...clone(DEF), hints: { guide: 'new', welcomed: true } } })
    useUI.setState({ sheets: [{ id: 1, render: () => null }] })
    show(<><Screen /><WelcomeTour /></>)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(host.querySelector('.cal-tour')).toBe(null)
    useUI.setState({ sheets: [] })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(host.querySelector('.cal-tour')).not.toBe(null)
    act(() => root.unmount())
    host.remove()

    useCalliope.setState({ tour: null })
    useStore.setState({ S: { ...clone(DEF), hints: { guide: 'off', welcomed: true } } })
    show(<><Screen /><WelcomeTour /></>)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(host.querySelector('.cal-tour')).toBe(null)
  })

  it('holds back until the screen is ready, and ends when the screen is left', () => {
    useStore.setState({ S: { ...clone(DEF), hints: { guide: 'new', welcomed: true } } })
    show(<><Screen ready={false} /><WelcomeTour /></>)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(host.querySelector('.cal-tour')).toBe(null)
    act(() => root.render(<><Screen /><WelcomeTour /></>))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(host.querySelector('.cal-tour')).not.toBe(null)
    act(() => root.render(<><WelcomeTour /></>))
    expect(host.querySelector('.cal-tour')).toBe(null)
  })
})

describe('tip', () => {
  it('shows once: Got it hides it for good, No more tips switches the guide off', () => {
    useStore.setState({ S: { ...clone(DEF), hints: { guide: 'new', welcomed: true } } })
    show(<><Tip id="plan" title="Plan your week">text</Tip><Tip id="feed" title="Finding your way">text</Tip></>)
    expect(host.querySelectorAll('[data-tip]').length).toBe(2)
    act(() => [...host.querySelectorAll('[data-tip="plan"] button')].find(b => b.textContent.includes('Got it')).click())
    expect(host.querySelector('[data-tip="plan"]')).toBe(null)
    expect(useStore.getState().S.hints.tips.plan).toBe(true)
    act(() => button('No more tips').click())
    expect(host.querySelectorAll('[data-tip]').length).toBe(0)
    expect(useStore.getState().S.hints.guide).toBe('off')
  })

  it('is Calliope’s: her face, and her voice on a tap only, even with her voice switched off', () => {
    useStore.setState({ S: { ...clone(DEF), hints: { guide: 'new', welcomed: true, calliopeMute: true } } })
    show(<Tip id="plan" title="Plan your week">Put your routines on weekdays.</Tip>)
    expect(host.querySelector('[data-tip="plan"] .cal-face')).not.toBe(null)
    expect(voice.speak).not.toHaveBeenCalled()
    act(() => host.querySelector('.guide-tip-say').click())
    expect(voice.speak).toHaveBeenCalledWith('Put your routines on weekdays.', expect.objectContaining({ who: 'calliope', keep: true }))
    expect(useStore.getState().S.hints.calliopeMute).toBe(true)
  })

  it('a tip with markup in it has no listen button', () => {
    useStore.setState({ S: { ...clone(DEF), hints: { guide: 'new', welcomed: true } } })
    show(<Tip id="plan" title="Plan your week"><b>bold</b> words</Tip>)
    expect(host.querySelector('.guide-tip-say')).toBe(null)
  })

  it('opens Calliope to ask her more', () => {
    useStore.setState({ S: { ...clone(DEF), hints: { guide: 'new', welcomed: true } } })
    show(<Tip id="plan" title="Plan your week">text</Tip>)
    act(() => button('Ask Calliope').click())
    expect(useUI.getState().sheets.length).toBe(1)
  })
})
