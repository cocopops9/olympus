// @vitest-environment happy-dom
// Olympus: Chiron's wake-up is animated by hand from his two real drawings (asleep and awake):
// both are on screen while he wakes, the keyframes hand over from one to the other, and nothing
// generated is played in between.
import React, { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ChironFigure, { WAKE_SECONDS } from './ChironFigure.jsx'

const roots = []
function mount(state) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  roots.push({ root, el })
  act(() => root.render(<ChironFigure state={state} size={150} />))
  return el
}
afterEach(() => { for (const { root, el } of roots.splice(0)) { act(() => root.unmount()); el.remove() } })
const css = readFileSync(resolve(process.cwd(), 'src/chiron-figure.css'), 'utf8')

describe('ChironFigure wake-up', () => {
  it('shows the drawing that fits each pose', () => {
    const asleep = mount('asleep')
    expect(asleep.querySelector('.chf-sleep.on')).not.toBeNull()
    expect(asleep.querySelector('.chf-wake.on')).toBeNull()
    for (const state of ['idle', 'listening', 'thinking', 'speaking']) {
      const el = mount(state)
      expect(el.querySelector('.chf-wake.on'), state).not.toBeNull()
      expect(el.querySelector('.chf-sleep.on'), state).toBeNull()
    }
  })

  it('while waking both drawings are there for the keyframes to hand over, with dust and no video layer', () => {
    const el = mount('waking')
    expect(el.querySelector('.chf-waking')).not.toBeNull()
    expect(el.querySelector('.chf-sleep')).not.toBeNull()
    expect(el.querySelector('.chf-wake')).not.toBeNull()
    // Neither is switched on by a class: the animation decides which one shows, moment by moment.
    expect(el.querySelector('.chf-img.on')).toBeNull()
    expect(el.querySelectorAll('.chf-burst .dust').length).toBeGreaterThan(3)
    expect(el.querySelector('.chf-clip')).toBeNull()
    expect(el.querySelector('canvas')).toBeNull()
    expect(mount('idle').querySelector('.chf-burst')).toBeNull()
  })

  it('the keyframes last as long as the wake-up, squash before the rise and overshoot after it', () => {
    expect(WAKE_SECONDS).toBe(1.4)
    expect(css).toContain('.chf-waking .chf-sleep{animation:chf-wk-stir ' + WAKE_SECONDS + 's')
    expect(css).toContain('.chf-waking .chf-wake{animation:chf-wk-rise ' + WAKE_SECONDS + 's')
    const rise = css.slice(css.indexOf('@keyframes chf-wk-rise{'), css.indexOf('@keyframes chf-wk-halo{'))
    expect(rise).toMatch(/scale\(\.95,1\.09\)/)       // taller than himself for a moment
    expect(rise).toMatch(/100%\{opacity:1;transform:scale\(1,1\)\}/)
    const stir = css.slice(css.indexOf('@keyframes chf-wk-stir{'), css.indexOf('@keyframes chf-wk-rise{'))
    expect(stir).toMatch(/scale\(1\.08,\.84\)/)       // low and wide before he goes
    expect(stir).toMatch(/100%\{opacity:0/)           // the sleeping drawing is gone at the end
  })
})
