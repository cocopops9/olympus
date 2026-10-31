// @vitest-environment happy-dom
// Olympus: Chiron awake by voice in the workout page. Three taps on a phone that can listen: he
// gets up, says the rest and the next set aloud with no network, then listens; what is heard goes
// to him, the answer is read aloud while his mouth moves, and he listens again; "basta" puts him
// back to sleep. Silence twice stops the microphone until it is tapped.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

const mocks = vi.hoisted(() => ({ sent: [], spoken: [], heard: [], listens: 0 }))
vi.mock('../lib/hercules.js', async orig => ({
  ...(await orig()),
  herculesStatus: vi.fn(async () => ({ on: true, perDay: 15, left: 15 })),
  askHercules: vi.fn(async (list, coach) => { mocks.sent.push([coach, list.at(-1).content]); return { reply: 'Add **2.5 kg**, keep 5 reps.', left: 14, perDay: 15 } }),
}))
vi.mock('../lib/social.js', async orig => ({ ...(await orig()), socialReady: () => true }))
vi.mock('../lib/voice.js', async orig => ({
  ...(await orig()),
  canListen: async () => true,
  canSpeak: () => true,
  speak: vi.fn(async text => { mocks.spoken.push(text) }),
  stopSpeaking: vi.fn(async () => {}),
  // Each listen hears the next thing in the list ('' is silence), then stops by itself.
  listen: vi.fn(async ({ onText, onEnd }) => {
    mocks.listens++
    const text = mocks.heard.shift() ?? ''
    setTimeout(() => { if (text) onText(text, true); onEnd() }, 5)
    return () => {}
  }),
}))
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { EXDB } from '../lib/exercises-data.js'
import { WorkoutChiron, useChiron } from './Chiron.jsx'

const squat = EXDB.find(e => e.n === 'barbell full squat')
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
  mocks.sent = []; mocks.spoken = []; mocks.heard = []; mocks.listens = 0
  localStorage.clear()
  useUI.setState({ sheets: [] })
  useChiron.setState({ awake: false })
  const S = structuredClone(DEF)
  S.active = { start: Date.now() - 600000, name: 'Legs', cur: 0, entries: [{ id: squat.id, sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5 }, { w: 100, r: 5 }] }] }
  useStore.setState({ S, user: { id: 'u' + Math.random(), name: 'Ada' }, ready: true })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { roots.splice(0).forEach(r => r.unmount()) }) })

const wake = async host => {
  await wait(5)   // the microphone is asked about first
  const btn = host.querySelector('.whdr-chiron')
  act(() => { btn.click(); btn.click(); btn.click() })
}

describe('Chiron by voice', () => {
  it('wakes in the page, says the rest and the next set, answers what he hears aloud, and sleeps on "basta"', async () => {
    mocks.heard = ['How much on the next set?', 'basta']
    const host = mount(<WorkoutChiron />)
    await wake(host)
    // awake in the page, not in a sheet
    expect(useUI.getState().sheets).toHaveLength(0)
    expect(host.querySelector('.chv')).not.toBeNull()
    await wait(1300)
    expect(mocks.spoken[0]).toBe('Rest 4 minutes, then 100 kg for 5 reps. What do you need?')
    await wait(200)
    expect(mocks.sent).toEqual([['chiron', 'How much on the next set?']])
    expect(mocks.spoken[1]).toBe('Add 2.5 kg, keep 5 reps.')
    await wait(200)
    expect(mocks.spoken[2]).toBe('Good work. Call me when you need me.')
    expect(useChiron.getState().awake).toBe(false)
    // asleep again: the figure lies down in the page
    expect(host.querySelector('.whdr-chiron')).not.toBeNull()
  })

  it('after two silences the microphone waits for a tap', async () => {
    mocks.heard = ['', '']
    const host = mount(<WorkoutChiron />)
    await wake(host)
    await wait(1500)
    expect(mocks.listens).toBe(2)
    expect(host.querySelector('.chv-st').textContent).toBe('Tap the microphone to talk to me.')
    expect(host.querySelector('.chf').getAttribute('class')).toContain('chf-idle')
    // a tap on the microphone: he listens again
    mocks.heard = ['What should I do next?', '', '']
    act(() => host.querySelector('.chv-b.mic').click())
    await wait(300)
    expect(mocks.sent.at(-1)).toEqual(['chiron', 'What should I do next?'])
  })

  it('the keyboard opens his sheet to read or type, and the moon puts him to sleep', async () => {
    mocks.heard = ['', '']
    const host = mount(<WorkoutChiron />)
    await wake(host)
    await wait(1500)
    act(() => host.querySelector('.chv-b[aria-label="Ask Chiron about this workout"]').click())
    expect(useUI.getState().sheets).toHaveLength(1)
    act(() => host.querySelector('.chv-b[aria-label="Let him sleep"]').click())
    expect(useChiron.getState().awake).toBe(false)
  })
})
