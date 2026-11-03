// @vitest-environment happy-dom
// Olympus: the part of a song that is shared. A catalogue song plays only from `from` to `to`
// seconds of its preview, and the sheet that picks a catalogue song hands over the range that was
// chosen (nothing at all when the whole 30 seconds stay selected).
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { SongBar, TrimSheet } from './Song.jsx'

const roots = []
const audios = []
class FakeAudio {
  constructor(src) {
    this.src = src; this.currentTime = 0; this.duration = 30; this.paused = true; this.listeners = {}
    audios.push(this)
  }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn) }
  play() { this.paused = false; this.onplay?.(); return Promise.resolve() }
  pause() { if (!this.paused) { this.paused = true; this.onpause?.() } }
}
const flush = () => act(() => new Promise(r => setTimeout(r, 0)))
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(el))
  return host
}
const track = { id: '17', title: 'Hit', artist: 'Star', art: 'https://is1-ssl.mzstatic.com/a.jpg', preview: 'https://audio-ssl.itunes.apple.com/p.m4a' }

beforeEach(() => { audios.length = 0; vi.stubGlobal('Audio', FakeAudio) })
afterEach(() => { roots.splice(0).forEach(r => act(() => r.unmount())); document.body.innerHTML = ''; vi.unstubAllGlobals() })

describe('a post\'s song from the catalogue', () => {
  it('plays only the part that was chosen and goes back to its start when it reaches the end', async () => {
    const host = mount(<SongBar song={{ src: 'apple', ...track, from: 5, to: 12 }} />)
    await act(async () => { host.querySelector('button').click() })
    const a = audios[0]
    expect(a.src).toBe(track.preview)
    expect(a.currentTime).toBe(5)
    expect(a.paused).toBe(false)
    a.currentTime = 12.1
    act(() => a.ontimeupdate())
    expect(a.paused).toBe(true)
    expect(a.currentTime).toBe(5)
  })
  it('a song with no range plays its whole preview', async () => {
    const host = mount(<SongBar song={{ src: 'apple', ...track }} />)
    await act(async () => { host.querySelector('button').click() })
    expect(audios[0].ontimeupdate).toBeUndefined()
    expect(audios[0].currentTime).toBe(0)
  })
})

describe('choosing the part of a preview', () => {
  const sliders = host => [...host.querySelectorAll('input[type="range"]')]
  const set = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    act(() => { setter.call(el, String(value)); el.dispatchEvent(new Event('input', { bubbles: true })) })
  }
  it('hands over the song as it is when the whole preview stays selected', async () => {
    const onPicked = vi.fn(), close = vi.fn()
    const host = mount(<TrimSheet track={track} close={close} onPicked={onPicked} />)
    await flush()
    const use = [...host.querySelectorAll('button')].find(b => /Use this song/.test(b.textContent))
    act(() => use.click())
    expect(onPicked).toHaveBeenCalledTimes(1)
    expect(onPicked.mock.calls[0][0]).toMatchObject({ src: 'apple', id: '17', title: 'Hit', preview: track.preview })
    expect(onPicked.mock.calls[0][0]).not.toHaveProperty('from')
    expect(close).toHaveBeenCalled()
  })
  it('hands over the range that was chosen, in whole seconds', async () => {
    const onPicked = vi.fn()
    const host = mount(<TrimSheet track={track} close={() => {}} onPicked={onPicked} />)
    await flush()
    const [start, end] = sliders(host)
    set(start, 4)
    set(end, 19)
    const use = [...host.querySelectorAll('button')].find(b => /Use this song/.test(b.textContent))
    act(() => use.click())
    expect(onPicked.mock.calls[0][0]).toMatchObject({ from: 4, to: 19 })
  })
  it('never lets the two ends touch: at least 3 seconds stay between them', async () => {
    const host = mount(<TrimSheet track={track} close={() => {}} onPicked={() => {}} />)
    await flush()
    const [start, end] = sliders(host)
    set(start, 29)
    expect(Number(start.value)).toBeLessThanOrEqual(27)
    set(end, 1)
    expect(Number(end.value)).toBeGreaterThanOrEqual(Number(start.value) + 3)
  })
})
