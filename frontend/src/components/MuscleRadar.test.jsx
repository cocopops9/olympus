// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import MuscleRadar from './MuscleRadar.jsx'
import SetValue from './SetValue.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host, root
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove() })

const zero = { back: 0, chest: 0, core: 0, shoulders: 0, arms: 0, legs: 0 }
const points = el => (typeof el === 'string' ? host.querySelector(el) : el).getAttribute('points').split(' ').map(p => p.split(',').map(Number))

describe('muscle distribution radar', () => {
  it('names the six regions with their sets, and draws both periods against one rim', () => {
    act(() => root.render(<MuscleRadar current={{ ...zero, legs: 12, chest: 6 }} previous={{ ...zero, back: 12 }} scale={12} />))
    const labels = [...host.querySelectorAll('.mradar-l')].map(n => n.textContent)
    expect(labels).toEqual(['Back0', 'Chest6', 'Core0', 'Shoulders0', 'Arms0', 'Legs12'])
    expect(host.querySelectorAll('.mradar-ring')).toHaveLength(4)
    // Legs reaches the rim on the left; back, at zero now, sits on the centre.
    const cur = points('.mradar-cur'), rim = points(host.querySelectorAll('.mradar-ring')[3])
    expect(cur[5]).toEqual(rim[5])
    expect(cur[0]).toEqual([160, 134])
    // The previous period's back reaches the rim too: the same scale for both.
    expect(points('.mradar-prev')[0]).toEqual(rim[0])
  })
})

describe('set value', () => {
  const read = label => { act(() => root.render(<SetValue label={label} unit="kg" />)); return host.querySelector('.setv').textContent }
  it('gives every number of a set its unit', () => {
    expect(read('30×16')).toBe('30kg×16reps')
    expect(host.querySelectorAll('.setv b')).toHaveLength(2)
    expect(read('4')).toBe('4reps')
    expect(read('+10 × 10')).toBe('+10kg×10reps')
    expect(read('5 min @ 12 km/h')).toBe('5min·12km/h')
    expect(read('20 each × 8')).toBe('20kgeach×8reps')
    // Two sets of reps: the units of weight stay, the word "reps" would crowd the chip.
    expect(read('100×8 ↘ 80×6')).toBe('100kg×8 ↘ 80kg×6')
    expect(read('45 s')).toBe('45 s')
  })
})
