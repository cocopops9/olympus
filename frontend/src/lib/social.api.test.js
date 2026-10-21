import { afterEach, describe, expect, it, vi } from 'vitest'

// What the client sends: each call's path and body, against a fake api(). The bug this guards
// against was real: createPost forwarded text and workout only, and posts lost their photos.
const calls = vi.hoisted(() => [])
vi.mock('./api.js', () => ({
  api: (path, opts) => { calls.push({ path, method: opts?.method || 'GET', body: opts?.body ? JSON.parse(opts.body) : null }); return Promise.resolve({ post: { id: 'p' }, user: {}, users: [], id: 'ph' }) },
  apiBlob: path => { calls.push({ path, method: 'BLOB' }); return Promise.resolve(new Blob([])) },
}))
import * as social from './social.js'

afterEach(() => { calls.length = 0 })
const last = () => calls.at(-1)

describe('social API calls', () => {
  it('sends a post with its photos, text and workout', async () => {
    await social.createPost({ text: 'hi', workout: { name: 'Legs' }, photos: ['a', 'b'] })
    expect(last()).toEqual({ path: '/api/social/posts', method: 'POST', body: { text: 'hi', workout: { name: 'Legs' }, photos: ['a', 'b'] } })
    await social.createPost({ text: 'no photos' })
    expect(last().body).toEqual({ text: 'no photos' })
  })
  it('names the right routes for profile, follows, requests, blocks and notifications', async () => {
    await social.saveProfile({ private: true, pushSocial: false })
    expect(last()).toMatchObject({ path: '/api/social/profile', method: 'POST', body: { private: true, pushSocial: false } })
    await social.setFollow('u1', false)
    expect(last()).toMatchObject({ path: '/api/social/follow', body: { id: 'u1', follow: false } })
    await social.answerRequest('u2', true)
    expect(last()).toMatchObject({ path: '/api/social/requests/answer', body: { id: 'u2', accept: true } })
    await social.setBlock('u3', true)
    expect(last()).toMatchObject({ path: '/api/social/block', body: { id: 'u3', block: true } })
    await social.removeFollower('u4')
    expect(last()).toMatchObject({ path: '/api/social/followers/remove', body: { id: 'u4' } })
    await social.markNotificationsRead()
    expect(last()).toMatchObject({ path: '/api/social/notifications/read', method: 'POST' })
    await social.fetchPost('p 1')
    expect(last()).toMatchObject({ path: '/api/social/post?id=p+1', method: 'GET' })
    await social.uploadPhoto('data:image/jpeg;base64,AAAA')
    expect(last()).toMatchObject({ path: '/api/social/photos', body: { data: 'data:image/jpeg;base64,AAAA' } })
    await social.photoBlob('ph1')
    expect(last()).toEqual({ path: '/api/social/photo?id=ph1', method: 'BLOB' })
  })
})
