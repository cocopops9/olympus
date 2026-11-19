// @vitest-environment happy-dom
// Olympus: the coach chat's microphone and its voice mode. The microphone shows a stop square
// while it records, and a tap stops it and closes the microphone, also a tap made while it was
// still opening (before, that tap did nothing and the microphone stayed on). Voice mode is a
// separate button: a spoken conversation, each answer read aloud in the voice of whoever wrote it,
// and the exercise shown when one is asked how to do.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

const mocks = vi.hoisted(() => ({ sent: [], spoken: [], heard: [], stops: [], released: 0, openMs: 5 }))
vi.mock('../lib/hercules.js', async orig => ({
  ...(await orig()),
  herculesStatus: vi.fn(async () => ({ on: true, perDay: 15, left: 15 })),
  askHercules: vi.fn(async (list, coach) => { mocks.sent.push([coach, list.at(-1).content]); return { reply: coach === 'athena' ? 'Chest up, knees out.' : 'Feet shoulder width apart.', left: 14, perDay: 15 } }),
}))
vi.mock('../lib/social.js', async orig => ({ ...(await orig()), socialReady: () => true }))
vi.mock('../lib/voice.js', async orig => ({
  ...(await orig()),
  canListen: async () => true,
  canSpeak: () => true,
  warmVoice: () => null,
  speak: vi.fn(async (text, { who, onStart } = {}) => { onStart?.(); mocks.spoken.push([who, text]) }),
  stopSpeaking: vi.fn(async () => {}),
  releaseMic: vi.fn(() => { mocks.released++ }),
  // Opens after `openMs`; hears the next thing in the list ('' is silence) and stops by itself,
  // unless the list is empty: then it records until it is stopped.
  listen: vi.fn(({ onText, onEnd, onReady }) => new Promise(resolve => setTimeout(() => {
    onReady?.()
    const text = mocks.heard.shift()
    const stop = vi.fn(opts => { mocks.stops.push(opts || {}); setTimeout(() => onEnd(), 1) })
    if (text !== undefined) setTimeout(() => { if (text) onText(text, true); onEnd() }, 5)
    resolve(stop)
  }, mocks.openMs))),
}))
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { MicButton } from './Voice.jsx'
import { VoiceMode } from './VoiceMode.jsx'
import { useCoachChat } from './Hercules.jsx'
import { BOTH } from '../lib/hercules.js'

const roots = []
const wait = ms => act(() => new Promise(r => setTimeout(r, ms)))
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(el))
  return host
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  Object.assign(mocks, { sent: [], spoken: [], heard: [], stops: [], released: 0, openMs: 5 })
  localStorage.clear()
  useUI.setState({ sheets: [] })
  useStore.setState({ S: structuredClone(DEF), user: { id: 'u' + Math.random(), name: 'Ada' }, ready: true })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { roots.splice(0).forEach(r => r.unmount()) }) })

describe('the microphone of the chat', () => {
  it('shows a stop square while it records, and a tap stops it and closes the microphone', async () => {
    const host = mount(<MicButton onText={() => {}} onFinal={() => {}} />)
    await wait(10)
    const btn = () => host.querySelector('button.mic')
    act(() => btn().click())
    await wait(20)
    expect(btn().classList.contains('on')).toBe(true)
    expect(btn().getAttribute('aria-label')).toBe('Stop dictation')
    expect(btn().querySelector('rect')).toBeTruthy()   // the stop square, not the microphone
    const before = mocks.released
    act(() => btn().click())
    expect(mocks.stops).toEqual([{}])                    // sent to be written out, not thrown away
    expect(mocks.released).toBeGreaterThan(before)      // the microphone is closed at once
    await wait(10)
    expect(btn().classList.contains('on')).toBe(false)
  })
  it('a tap while the microphone is still opening stops it once it is open', async () => {
    mocks.openMs = 60
    const host = mount(<MicButton onText={() => {}} onFinal={() => {}} />)
    await wait(10)
    const btn = () => host.querySelector('button.mic')
    act(() => btn().click())
    await wait(10)
    act(() => btn().click())   // still opening
    expect(mocks.stops).toEqual([])
    await wait(80)
    expect(mocks.stops).toEqual([{ cancel: true }])
    await wait(10)
    expect(btn().classList.contains('on')).toBe(false)
  })
})

function Harness({ coach, onClose = () => {} }) {
  const c = useCoachChat({ coach })
  return <VoiceMode chat={c} coach={coach} close={onClose} />
}

describe('voice mode', () => {
  it('reads each coach’s answer in that coach’s voice, then listens again', async () => {
    mocks.heard = ['What do I do for my knees?', '', '']
    mount(<Harness coach={BOTH} />)
    await wait(150)
    // Hercules answers first, Athena after him (she reads his answer too).
    expect(mocks.sent.map(([who]) => who)).toEqual(['hercules', 'athena'])
    expect(mocks.sent[0][1]).toBe('What do I do for my knees?')
    expect(mocks.spoken.map(([who]) => who)).toEqual(['hercules', 'athena'])
    // Two silences after it: paused, the microphone closed.
    expect(document.querySelector('.vmode').classList.contains('paused')).toBe(true)
    expect(mocks.released).toBeGreaterThan(0)
  })
  it('shows the exercise it is asked how to do', async () => {
    mocks.heard = ['How do I do a barbell squat?', '', '']
    mount(<Harness coach="athena" />)
    await wait(150)
    expect(mocks.spoken.map(([who]) => who)).toEqual(['athena'])
    expect(document.querySelector('.vmode .exdemo figcaption')?.textContent).toMatch(/squat/i)
  })
  it('the cross ends it', async () => {
    let closed = false
    mount(<Harness coach="hercules" onClose={() => { closed = true }} />)
    await wait(20)
    act(() => document.querySelector('.vmode-b.end').click())
    expect(closed).toBe(true)
  })
})
