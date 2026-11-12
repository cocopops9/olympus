// @vitest-environment happy-dom
// The goals and memory sheet (components/CoachGoals.jsx): the full-screen coach's memory button
// opens it already scrolled to the memory notes, every other way in opens it at the top.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { coachGoalsSheet } from './CoachGoals.jsx'

let root, host, scrolled
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useStore.setState({ S: structuredClone(DEF), user: { id: 'u1', name: 'Giuseppe' }, ready: true })
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
  scrolled = []
  window.HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this.className) }
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })

const open = options => {
  let render
  vi.spyOn(useUI.getState(), 'openSheet').mockImplementation(fn => { render = fn })
  options === undefined ? coachGoalsSheet() : coachGoalsSheet(options)
  act(() => root.render(render(() => {})))
}

describe('coach goals sheet', () => {
  it('scrolls to the memory when opened from the memory button', () => {
    open({ focus: 'memory' })
    expect(scrolled).toEqual(['cg-mem'])
    expect(host.textContent).toContain('Your memory')
  })

  it('stays at the top for every other way in, a click event included', () => {
    open()
    open({})
    expect(scrolled).toEqual([])
  })
})
