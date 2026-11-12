// @vitest-environment happy-dom
// The AI coaches full screen (views/CoachAI.jsx): the coach is picked like a model, the
// conversations of both are in the drawer, and the floating button can be switched back on.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const mocks = vi.hoisted(() => ({ coaches: [] }))
vi.mock('../lib/hercules.js', async orig => ({
  ...(await orig()),
  herculesStatus: vi.fn(async () => ({ on: true, perDay: 20, left: 20 })),
  askHercules: vi.fn(async (list, coach) => { mocks.coaches.push(coach); return { reply: 'Answer from ' + coach, left: 19, perDay: 20 } }),
}))
import { useStore, DEF } from '../store/useStore.js'
import CoachAI from './CoachAI.jsx'
import { fabHidden, setFabHidden, resetGreetingForTests } from '../components/Hercules.jsx'
import { useUI } from '../store/useUI.js'

let root, host
const flush = () => act(() => new Promise(r => setTimeout(r, 0)))
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear(); resetGreetingForTests(); mocks.coaches = []
  useStore.setState({ S: structuredClone(DEF), user: { id: 'u1', name: 'Giuseppe Rossi' }, ready: true })
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const type = text => {
  const box = host.querySelector('.cai-box textarea')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  act(() => { setter.call(box, text); box.dispatchEvent(new Event('input', { bubbles: true })) })
  act(() => host.querySelector('.cai-box .hc-send').click())
}

describe('AI coach, full screen', () => {
  it('greets by name; switching Hercules to Athena keeps the conversation, and the drawer lists it once', async () => {
    act(() => root.render(<MemoryRouter initialEntries={['/ai']}><CoachAI /></MemoryRouter>))
    await flush()
    expect(host.textContent).toMatch(/Giuseppe/)
    expect(host.querySelector('.cai-pick').textContent).toContain('Hercules')
    type('Squat tips'); await flush(); await flush()
    expect(host.textContent).toContain('Answer from hercules')
    act(() => host.querySelector('.cai-pick').click())
    act(() => [...host.querySelectorAll('.cai-model')].find(b => b.textContent.includes('Athena') && !b.textContent.includes('Hercules')).click())
    await flush()
    expect(host.querySelector('.cai-pick').textContent).toContain('Athena')
    // the same conversation: Hercules's answer is still on screen, Athena answers the next one
    expect(host.querySelector('.cai-me').textContent).toBe('Squat tips')
    type('Deload plan'); await flush(); await flush()
    expect(mocks.coaches).toEqual(['hercules', 'athena'])
    expect([...host.querySelectorAll('.cai-who')].map(e => e.textContent)).toEqual(['Hercules', 'Athena'])
    const titles = [...host.querySelectorAll('.cai-dt')].map(e => e.textContent)
    expect(titles).toEqual(['Squat tips'])
    // a new conversation, then the first one again: it opens with Athena still answering
    act(() => host.querySelector('.cai-new').click())
    await flush()
    type('Mobility'); await flush(); await flush()
    expect([...host.querySelectorAll('.cai-dt')].map(e => e.textContent)).toEqual(['Mobility', 'Squat tips'])
    act(() => host.querySelectorAll('.cai-dopen')[1].click())
    await flush()
    expect(host.querySelector('.cai-me').textContent).toBe('Squat tips')
  })

  it('brings the floating coach back', async () => {
    setFabHidden(true)
    act(() => root.render(<MemoryRouter initialEntries={['/ai?c=athena']}><CoachAI /></MemoryRouter>))
    await flush()
    expect(host.querySelector('.cai-pick').textContent).toContain('Athena')
    act(() => host.querySelector('.cai-dfoot button, .cai-dfoot input').click())
    expect(fabHidden()).toBe(false)
  })

  it('has the memory in the top bar instead of the new-conversation pencil', async () => {
    act(() => root.render(<MemoryRouter initialEntries={['/ai']}><CoachAI /></MemoryRouter>))
    await flush()
    const top = host.querySelector('.cai-top')
    expect(top.querySelector('button[aria-label="New conversation"]')).toBeNull()
    const openSheet = vi.spyOn(useUI.getState(), 'openSheet').mockImplementation(() => {})
    const memory = top.querySelector('button[aria-label="Your memory"]')
    expect(memory).toBeTruthy()
    act(() => memory.click())
    expect(openSheet).toHaveBeenCalledTimes(1)
    openSheet.mockRestore()
    // a new conversation is still one tap away, in the drawer
    expect(host.querySelector('.cai-new')).toBeTruthy()
  })
})

describe('AI coach, drag down to minimise', () => {
  const screen = () => act(() => root.render(
    <MemoryRouter initialEntries={['/ai']}><Routes>
      <Route path="/ai" element={<CoachAI />} />
      <Route path="/profile" element={<div id="profile-page">Profile</div>} />
    </Routes></MemoryRouter>))
  const touch = (el, type, y, x = 100) => {
    const ev = new Event(type, { bubbles: true, cancelable: true })
    const point = { clientX: x, clientY: y }
    ev.touches = type === 'touchend' ? [] : [point]
    act(() => { el.dispatchEvent(ev) })
    return ev
  }
  const drag = (el, ys) => { touch(el, 'touchstart', ys[0]); ys.slice(1).forEach(y => touch(el, 'touchmove', y)); touch(el, 'touchend', ys.at(-1)) }
  const later = ms => act(() => new Promise(r => setTimeout(r, ms)))

  it('leaves after a long pull down from the top bar', async () => {
    screen(); await flush()
    drag(host.querySelector('.cai-top'), [100, 140, 220, 330])
    expect(host.querySelector('.cai').style.transform).toBe('translateY(100%)')
    await later(260)
    expect(host.querySelector('#profile-page')).toBeTruthy()
  })

  it('springs back after a short pull, and stays', async () => {
    screen(); await flush()
    const top = host.querySelector('.cai-top')
    // a slow drag: a quick one that short would count as a flick and leave
    let now = 1000
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    touch(top, 'touchstart', 100); touch(top, 'touchmove', 160)
    expect(host.querySelector('.cai').style.transform).toMatch(/^translateY\(\d+px\)$/)
    now += 1500
    touch(top, 'touchmove', 170); touch(top, 'touchend', 170)
    clock.mockRestore()
    expect(host.querySelector('.cai').style.transform).toBe('')
    await later(260)
    expect(host.querySelector('#profile-page')).toBeNull()
    expect(host.querySelector('.cai')).toBeTruthy()
  })

  it('follows the finger while it is down and stops the page from scrolling', async () => {
    screen(); await flush()
    const top = host.querySelector('.cai-top')
    touch(top, 'touchstart', 100)
    const ev = touch(top, 'touchmove', 180)
    expect(ev.defaultPrevented).toBe(true)
    expect(host.querySelector('.cai').style.transform).toBe('translateY(68px)')
    touch(top, 'touchend', 180)
  })

  it('does nothing for a sideways move, an upward one, or one that starts in the text box', async () => {
    screen(); await flush()
    const top = host.querySelector('.cai-top')
    touch(top, 'touchstart', 100, 100); touch(top, 'touchmove', 130, 260); touch(top, 'touchmove', 300, 270); touch(top, 'touchend', 300)
    touch(top, 'touchstart', 300); touch(top, 'touchmove', 200); touch(top, 'touchend', 200)
    drag(host.querySelector('.cai-box textarea'), [100, 200, 400])
    expect(host.querySelector('.cai').style.transform).toBe('')
    await later(260)
    expect(host.querySelector('#profile-page')).toBeNull()
  })

  it('from the conversation it works only while that is scrolled to its top', async () => {
    screen(); await flush()
    const main = host.querySelector('.cai-main')
    main.scrollTop = 80
    drag(main, [100, 200, 400])
    expect(host.querySelector('.cai').style.transform).toBe('')
    main.scrollTop = 0
    drag(main, [100, 160, 260, 400])
    await later(260)
    expect(host.querySelector('#profile-page')).toBeTruthy()
  })
})
