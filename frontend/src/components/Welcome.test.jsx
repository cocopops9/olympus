// @vitest-environment happy-dom
// The welcome (components/Welcome.jsx): one question, and the answer decides how much help the
// screens give — out in one tap for whoever knows apps like this, a short tour for a newcomer.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { welcomeSheet } from './Welcome.jsx'
import { Tip } from './Guide.jsx'
import { tipVisible } from '../lib/guide.js'

vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const clone = v => JSON.parse(JSON.stringify(v))

let root, host
function show(node) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(node))
}
// The sheet the welcome opened, rendered on its own; re-rendered as the store changes.
function Sheet() {
  const sheets = useUI(s => s.sheets)
  const top = sheets.at(-1)
  return top ? top.render(() => useUI.getState().closeSheet(top.id)) : null
}
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text))

beforeEach(() => {
  useUI.setState({ sheets: [] })
  useStore.setState({ S: clone(DEF), user: null })
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('welcome', () => {
  it('someone who has used apps like this is out in one tap, with only the analysis tips left', () => {
    const then = vi.fn()
    act(() => welcomeSheet(then))
    show(<Sheet />)
    act(() => host.querySelector('[data-level="some"]').click())
    expect(useStore.getState().S.hints).toMatchObject({ guide: 'some', welcomed: true })
    expect(useUI.getState().sheets.length).toBe(0)
    expect(then).toHaveBeenCalled()
    const S = useStore.getState().S
    expect(tipVisible(S, 'workoutStart')).toBe(false)
    expect(tipVisible(S, 'stats')).toBe(true)
  })

  it('a newcomer gets the tour, step by step, and can leave it at any point', () => {
    act(() => welcomeSheet())
    show(<Sheet />)
    act(() => host.querySelector('[data-level="new"]').click())
    expect(host.querySelector('[data-step]').dataset.step).toBe('0')
    act(() => button('Next').click())
    expect(host.querySelector('[data-step]').dataset.step).toBe('1')
    act(() => button('Skip the tour').click())
    expect(useUI.getState().sheets.length).toBe(0)
    expect(useStore.getState().S.hints.guide).toBe('new')
  })
})

describe('tip', () => {
  it('shows once: Got it hides it for good, No more tips switches the guide off', () => {
    useStore.setState({ S: { ...clone(DEF), hints: { guide: 'new', welcomed: true } } })
    show(<><Tip id="plan" title="Plan your week">text</Tip><Tip id="feed" title="Finding your way">text</Tip></>)
    expect(host.querySelectorAll('[data-tip]').length).toBe(2)
    act(() => host.querySelector('[data-tip="plan"] button').click())   // Got it
    expect(host.querySelector('[data-tip="plan"]')).toBe(null)
    expect(useStore.getState().S.hints.tips.plan).toBe(true)
    act(() => button('No more tips').click())
    expect(host.querySelectorAll('[data-tip]').length).toBe(0)
    expect(useStore.getState().S.hints.guide).toBe('off')
  })
})
