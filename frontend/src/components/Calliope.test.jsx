// @vitest-environment happy-dom
// Asking Calliope (components/Calliope.jsx): a question about the app, answered in her bubble,
// read aloud, with a way to the screen she names.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const voice = vi.hoisted(() => ({ speak: vi.fn(() => Promise.resolve()), stopSpeaking: vi.fn(() => Promise.resolve()), preloadVoice: vi.fn(), warmVoice: vi.fn(), canListen: vi.fn(() => Promise.resolve(false)) }))
vi.mock('../lib/voice.js', async orig => ({ ...(await orig()), ...voice }))
const api = vi.hoisted(() => vi.fn())
vi.mock('../lib/api.js', async orig => ({ ...(await orig()), api }))

import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { CalliopeButton, CalliopeFigure, calliopeSheet } from './Calliope.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const clone = v => JSON.parse(JSON.stringify(v))

let root, host
function show(node) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(node))
}
function Sheet() {
  const sheets = useUI(s => s.sheets)
  const top = sheets.at(-1)
  return top ? top.render(() => useUI.getState().closeSheet(top.id)) : null
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
const bubbles = () => [...host.querySelectorAll('.cal-m')].map(b => b.textContent)

beforeEach(() => {
  Object.values(voice).forEach(f => f.mockClear())
  api.mockReset()
  useUI.setState({ sheets: [] })
  useStore.setState({ S: clone(DEF), user: { id: 'u1', name: 'Ada' } })
  window.location.hash = '#/home'
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('ask Calliope', () => {
  it('her button at the top of Home opens her, with questions to start from', async () => {
    show(<><CalliopeButton /><Sheet /></>)
    act(() => host.querySelector('.cal-help').click())
    await flush()
    expect(host.querySelector('.cal-ask')).not.toBe(null)
    expect(host.querySelectorAll('.cal-chips .chip').length).toBe(4)
    expect(bubbles().length).toBe(1)
    expect(voice.speak).not.toHaveBeenCalled()   // she does not talk before she is asked
  })

  it('answers a question in her bubble and aloud, and offers the way to the screen she names', async () => {
    api.mockResolvedValue({ reply: 'Open Profile, then Plan, then New routine.\nGO: plan', left: 29 })
    show(<Sheet />)
    act(() => calliopeSheet())
    await flush()
    await act(async () => { host.querySelector('.cal-chips .chip').click() })
    await flush()
    expect(api).toHaveBeenCalledWith('/api/calliope', expect.objectContaining({ method: 'POST' }))
    expect(bubbles().at(-1)).toContain('Open Profile, then Plan, then New routine.')
    expect(bubbles().at(-1)).not.toContain('GO:')
    expect(voice.speak).toHaveBeenCalledWith('Open Profile, then Plan, then New routine.', expect.objectContaining({ who: 'calliope' }))
    expect(host.querySelector('.cal-chips')).toBe(null)
    act(() => host.querySelector('.cal-m-go button').click())
    expect(window.location.hash).toBe('#/plan')
    expect(useUI.getState().sheets.length).toBe(0)
  })

  it('says so when she has no answers left today, without losing the question', async () => {
    api.mockRejectedValue(Object.assign(new Error('no'), { status: 429, data: { code: 'hercules-limit' } }))
    show(<Sheet />)
    act(() => calliopeSheet('How do I log a set?'))
    await flush()
    await flush()
    expect(bubbles()).toContain('How do I log a set?')
    expect(host.querySelector('.cal-err').textContent).toContain('tomorrow')
    expect(voice.speak).not.toHaveBeenCalled()
  })

  it('keeps quiet with her voice switched off: the answer is only written', async () => {
    useStore.setState({ S: { ...clone(DEF), hints: { calliopeMute: true } } })
    api.mockResolvedValue({ reply: 'Tap the check at the end of the row.', left: 5 })
    show(<Sheet />)
    act(() => calliopeSheet('How do I log a set?'))
    await flush()
    await flush()
    expect(bubbles().at(-1)).toBe('Tap the check at the end of the row.')
    expect(voice.speak).not.toHaveBeenCalled()
  })
})

describe('her figure', () => {
  it('moves her mouth only while she talks', () => {
    vi.useFakeTimers()
    show(<CalliopeFigure talking={false} />)
    const mouth = () => host.querySelector('.cal-fig-mouth').style.opacity
    expect(mouth()).toBe('0')
    act(() => root.render(<CalliopeFigure talking />))
    const seen = new Set([mouth()])
    for (let i = 0; i < 12; i++) { act(() => { vi.advanceTimersByTime(120) }); seen.add(mouth()) }
    expect(seen).toEqual(new Set(['0', '1']))
    act(() => root.render(<CalliopeFigure talking={false} />))
    expect(mouth()).toBe('0')
    vi.useRealTimers()
  })
})
