// @vitest-environment happy-dom
// Voice mode on the AI coach screen with both coaches answering (views/CoachAI.jsx): Athena's
// answer arriving while Hercules is still talking waits for him to finish instead of cutting him
// off, and the microphone opens only once the last answer has been read.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

const h = vi.hoisted(() => ({ said: [], texts: [], ends: [], stops: 0, mic: 0, warmed: [] }))
vi.mock('../lib/hercules.js', async orig => ({
  ...(await orig()),
  herculesStatus: vi.fn(async () => ({ on: true, perDay: 20, left: 20 })),
  // Athena's answer carries a short spoken version (api/hercules.js SPEECH_HELP); Hercules's does not.
  askHercules: vi.fn(async (list, coach) => ({ reply: 'Answer from ' + coach + '.' + (coach === 'athena' ? '\n\n- 1.6-2.2 g/kg\n\n```olympus-speech\nAbout two grams of protein per kilo.\n```' : ''), left: 19, perDay: 20 })),
}))
vi.mock('../lib/voice.js', async orig => ({
  ...(await orig()),
  canSpeak: () => true,
  warmVoice: () => Promise.resolve(),
  warmCoachVoice: who => { h.warmed.push(who); return Promise.resolve() },
  speak: (text, { who }) => { h.said.push(who); h.texts.push(text); return new Promise(r => h.ends.push(r)) },
  stopSpeaking: async () => { h.stops++ },
}))
vi.mock('../components/Voice.jsx', async orig => ({
  ...(await orig()),
  useCanListen: () => true,
  MicButton: ({ control }) => { control.current = { start: () => { h.mic++ }, stop: () => {} }; return null },
}))
import { useStore, DEF } from '../store/useStore.js'
import CoachAI from './CoachAI.jsx'
import { resetGreetingForTests } from '../components/Hercules.jsx'

let root, host
const flush = () => act(() => new Promise(r => setTimeout(r, 0)))
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear(); resetGreetingForTests()
  Object.assign(h, { said: [], texts: [], ends: [], stops: 0, mic: 0, warmed: [] })
  localStorage.setItem('olympus_voice_mode', '1')
  useStore.setState({ S: structuredClone(DEF), user: { id: 'u1', name: 'Giuseppe Rossi' }, ready: true })
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('voice mode with both coaches', () => {
  it('reads Athena after Hercules has finished, then listens', async () => {
    act(() => root.render(<MemoryRouter initialEntries={['/ai?c=both']}><CoachAI /></MemoryRouter>))
    await flush(); await flush()
    expect(h.warmed).toEqual(expect.arrayContaining(['hercules', 'athena']))
    const micAtStart = h.mic
    // A question, as the microphone would send it: both answers come back.
    const box = host.querySelector('.cai-box textarea')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    act(() => { setter.call(box, 'Plan my week'); box.dispatchEvent(new Event('input', { bubbles: true })) })
    act(() => host.querySelector('.cai-box .hc-send').click())
    await flush(); await flush(); await flush()
    // Hercules is talking; Athena's answer is there but waits, and nothing was stopped.
    expect(h.said).toEqual(['hercules'])
    // The banner names who is heard, not the coach picked on the screen.
    const banner = () => host.querySelector('.voice-banner').textContent
    expect(banner()).toMatch(/^Hercules is speaking/)
    const stopsWhileTalking = h.stops
    expect(h.mic).toBe(micAtStart)
    await act(async () => { h.ends[0]() })
    await flush()
    expect(h.said).toEqual(['hercules', 'athena'])
    expect(banner()).toMatch(/^Athena is speaking/)
    // Each says its spoken version when it wrote one, else its written answer; the spoken
    // version is never shown.
    expect(h.texts).toEqual(['Answer from hercules.', 'About two grams of protein per kilo.'])
    expect(host.textContent).not.toContain('olympus-speech')
    expect(host.textContent).not.toContain('About two grams')
    expect(h.stops).toBe(stopsWhileTalking)
    expect(h.mic).toBe(micAtStart)
    await act(async () => { h.ends[1]() })
    await flush()
    expect(h.mic).toBe(micAtStart + 1)
  })
})
