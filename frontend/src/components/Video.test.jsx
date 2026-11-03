// @vitest-environment happy-dom
// Olympus: the video of a post. The field offers "Add a video" (and steps aside while the post has
// photos), a chosen video shows with a button to take it off, and a post's video is fetched only
// when it is played.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

const mocks = vi.hoisted(() => ({ blob: vi.fn() }))
vi.mock('../lib/social.js', async orig => ({ ...(await orig()), videoBlob: mocks.blob }))
import { VideoField, PostVideo } from './Video.jsx'

const roots = []
const flush = () => act(() => new Promise(r => setTimeout(r, 0)))
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(el))
  return host
}
beforeEach(() => {
  mocks.blob.mockReset()
  mocks.blob.mockResolvedValue(new Blob(['x'], { type: 'video/mp4' }))
  URL.createObjectURL = vi.fn(() => 'blob:test'); URL.revokeObjectURL = vi.fn()
})
afterEach(() => { roots.splice(0).forEach(r => act(() => r.unmount())); document.body.innerHTML = '' })

describe('the video field of a post being written', () => {
  it('offers Add a video, and a file input that takes videos only', () => {
    const host = mount(<VideoField value={null} onChange={() => {}} />)
    expect(host.querySelector('button').textContent).toContain('Add a video')
    expect(host.querySelector('input[type=file]').getAttribute('accept')).toBe('video/*')
  })
  it('steps aside while the post has photos: a post has photos or a video', () => {
    const host = mount(<VideoField value={null} onChange={() => {}} disabled />)
    expect(host.querySelector('button').disabled).toBe(true)
  })
  it('a chosen video shows its length and a button that takes it off', () => {
    const changed = vi.fn()
    const host = mount(<VideoField value={{ id: 'v1', secs: 75, url: 'blob:mine' }} onChange={changed} />)
    expect(host.querySelector('.vid-len').textContent).toBe('1:15')
    expect(host.querySelector('button[aria-label="Remove video"]')).not.toBe(null)
    act(() => { host.querySelector('button[aria-label="Remove video"]').click() })
    expect(changed).toHaveBeenCalledWith(null)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mine')
  })
  it('a video already on the server shows without a local file', () => {
    const host = mount(<VideoField value={{ id: 'v1', secs: 9 }} onChange={() => {}} />)
    expect(host.querySelector('.vid-posted')).not.toBe(null)
    expect(host.querySelector('video')).toBe(null)
  })
})

describe('a post\'s video', () => {
  it('waits behind a cover with its length: nothing is downloaded yet', () => {
    const host = mount(<PostVideo video={{ id: 'v1', secs: 12 }} />)
    expect(host.querySelector('.vid-len').textContent).toBe('0:12')
    expect(host.querySelector('video')).toBe(null)
    expect(mocks.blob).not.toHaveBeenCalled()
  })
  it('a tap fetches it once and shows a player', async () => {
    const host = mount(<PostVideo video={{ id: 'v1', secs: 12 }} />)
    await act(async () => { host.querySelector('button.vid-cover').click() })
    await flush()
    expect(mocks.blob).toHaveBeenCalledTimes(1)
    expect(mocks.blob).toHaveBeenCalledWith('v1')
    const v = host.querySelector('video')
    expect(v).not.toBe(null)
    expect(v.getAttribute('src')).toBe('blob:test')
    expect(v.hasAttribute('controls')).toBe(true)
  })
  it('a failed download can be tried again', async () => {
    mocks.blob.mockRejectedValueOnce(new Error('offline'))
    const host = mount(<PostVideo video={{ id: 'v1', secs: 12 }} />)
    await act(async () => { host.querySelector('button.vid-cover').click() })
    await flush()
    expect(host.querySelector('.vid-len').textContent).toBe('Tap to try again')
    await act(async () => { host.querySelector('button.vid-cover').click() })
    await flush()
    expect(host.querySelector('video')).not.toBe(null)
  })
  it('a post without a video shows nothing', () => {
    const host = mount(<PostVideo video={undefined} />)
    expect(host.innerHTML).toBe('')
  })
})
