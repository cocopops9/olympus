// @vitest-environment happy-dom
// The celebration of a medal (components/Medals.jsx): it grows with the tier, plays and leaves by
// itself, and never has to be answered.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

const sound = vi.hoisted(() => ({ triumph: vi.fn() }))
vi.mock('../lib/sound.js', async orig => ({ ...(await orig()), ...sound }))

import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { CELEBRATION, MedalCelebration, celebrate, celebrationOf } from './Medals.jsx'
import { TIERS } from '../lib/medals.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const medal = (tier, id = tier) => ({ id, tier, title: 'Medal ' + id, desc: 'What it is for', fun: tier === 'gold' ? 'As heavy as a lion' : '', icon: 'medal', earned: true })

let root, host
beforeEach(() => {
  vi.useFakeTimers()
  sound.triumph.mockClear()
  useUI.setState({ sheets: [] })
  useStore.setState({ S: { ...JSON.parse(JSON.stringify(DEF)), sound: true } })
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<MemoryRouter><MedalCelebration /></MemoryRouter>))
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })
const shown = () => host.querySelector('.mdl-cele')

describe('medal celebration', () => {
  it('every tier has a celebration, each staying longer and falling more than the one below', () => {
    const steps = TIERS.map(t => CELEBRATION[t])
    expect(steps.every(Boolean)).toBe(true)
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].stay).toBeGreaterThan(steps[i - 1].stay)
      expect(steps[i].confetti).toBeGreaterThanOrEqual(steps[i - 1].confetti)
    }
    expect(celebrationOf(medal('platinum')).kind).toBe('stage')
    expect(celebrationOf({ tier: 'unknown' })).toBe(CELEBRATION.bronze)
  })

  it('bronze is a quiet banner at the top: no confetti, no fanfare, the app stays usable', () => {
    act(() => celebrate([medal('bronze')]))
    expect(shown().className).toContain('mdl-cele-banner')
    expect(shown().className).toContain('tier-bronze')
    expect(host.querySelector('.mdl-confetti')).toBe(null)
    expect(host.querySelector('.mdl-rays')).toBe(null)
    expect(sound.triumph).not.toHaveBeenCalled()
    expect(host.querySelector('.mdl-banner').textContent).toContain('Medal bronze')
  })

  it('gold adds confetti and the fanfare to the banner', () => {
    act(() => celebrate([medal('gold')]))
    expect(shown().className).toContain('mdl-cele-banner')
    expect(host.querySelectorAll('.mdl-confetti i').length).toBe(CELEBRATION.gold.confetti)
    expect(sound.triumph).toHaveBeenCalledTimes(1)
    expect(host.querySelector('.mdl-banner').textContent).toContain('As heavy as a lion')
  })

  it('the Olympian takes the stage: rays, a second wheel, the shockwave, the flash, the most confetti', () => {
    act(() => celebrate([medal('platinum')]))
    expect(shown().className).toContain('mdl-cele-stage')
    expect(host.querySelectorAll('.mdl-rays').length).toBe(1)
    expect(host.querySelector('.mdl-shock')).toBe(null)
    act(() => { vi.advanceTimersByTime(CELEBRATION.platinum.stay + 50) })
    expect(shown()).toBe(null)
    act(() => celebrate([medal('olympian')]))
    expect(host.querySelectorAll('.mdl-rays').length).toBe(2)
    expect(host.querySelector('.mdl-shock')).not.toBe(null)
    expect(host.querySelector('.mdl-stage-flash')).not.toBe(null)
    expect(host.querySelectorAll('.mdl-confetti i').length).toBe(CELEBRATION.olympian.confetti)
  })

  it('leaves by itself, then shows the next one; a tap sends it away sooner', () => {
    act(() => celebrate([medal('silver', 'a'), medal('bronze', 'b')]))
    expect(host.querySelector('.mdl-banner').textContent).toContain('Medal a')
    expect(host.querySelector('.mdl-banner').textContent).toContain('+1')
    act(() => { vi.advanceTimersByTime(CELEBRATION.silver.stay + 50) })
    expect(host.querySelector('.mdl-banner').textContent).toContain('Medal b')
    act(() => host.querySelector('.mdl-banner-x').click())
    expect(shown()).toBe(null)
  })

  it('a tap on the medal opens what it is', () => {
    act(() => celebrate([medal('gold')]))
    act(() => host.querySelector('.mdl-banner').click())
    expect(shown()).toBe(null)
    expect(useUI.getState().sheets.length).toBe(1)
  })
})
