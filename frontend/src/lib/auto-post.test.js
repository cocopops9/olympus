// Every finished workout becomes a post (lib/auto-post.js): the queue in the training document,
// the retry while offline, a deleted workout taking its post along.
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({ state: null, posts: [], deleted: [], fail: null }))
vi.mock('../store/useStore.js', () => {
  const store = {
    getState: () => mocks.state,
    subscribe: () => () => {},
  }
  return { useStore: store }
})
vi.mock('./social.js', async orig => ({
  ...(await orig()),
  createPost: vi.fn(async ({ wid, workout, text, photos }) => {
    if (mocks.fail) throw mocks.fail
    const had = mocks.posts.find(p => p.wid === wid)
    if (had) return had
    const p = { id: 'p' + (mocks.posts.length + 1), wid, workout, text, photos }
    mocks.posts.push(p)
    return p
  }),
  deletePost: vi.fn(async id => { if (mocks.fail) throw mocks.fail; mocks.deleted.push(id); return { ok: true } }),
  editPost: vi.fn(async ({ id, text, photos, workout }) => {
    if (mocks.fail) throw mocks.fail
    const p = mocks.posts.find(x => x.id === id)
    if (!p) throw Object.assign(new Error('gone'), { status: 404 })
    Object.assign(p, { text, photos, workout })
    return p
  }),
}))
import { queuePost, forgetPost, flushPosts, postState, unpost, repost, setPostDetails, postDetails } from './auto-post.js'

const workout = id => ({ id, name: 'Chest', d: '2026-10-25', start: 1, end: 3600001, entries: [{ id: '0025', sets: [{ w: 60, r: 8, done: true }] }] })
function setup(extra = {}) {
  const S = { unit: 'kg', workouts: [workout('w1')], ...extra }
  mocks.state = { S, ready: true, user: { id: 'u1', name: 'A' }, update: fn => { fn(mocks.state.S) } }
  return mocks.state
}

describe('auto-posting', () => {
  beforeEach(() => { mocks.posts = []; mocks.deleted = []; mocks.fail = null })

  it('posts a queued workout once, and marks it posted', async () => {
    const st = setup()
    queuePost(st.S, st.S.workouts[0])
    expect(postState(st.S, st.S.workouts[0]).state).toBe('waiting')
    await flushPosts()
    expect(mocks.posts).toHaveLength(1)
    expect(mocks.posts[0].wid).toBe('w1')
    expect(postState(st.S, st.S.workouts[0])).toEqual({ state: 'posted', id: 'p1' })
    await flushPosts()
    expect(mocks.posts).toHaveLength(1)
  })

  it('keeps the workout waiting while the network is down, and posts it later', async () => {
    const st = setup()
    queuePost(st.S, st.S.workouts[0])
    mocks.fail = Object.assign(new Error('offline'), { status: 0 })
    await flushPosts()
    expect(postState(st.S, st.S.workouts[0]).state).toBe('waiting')
    mocks.fail = null
    await flushPosts()
    expect(postState(st.S, st.S.workouts[0]).state).toBe('posted')
  })

  it('drops a workout the server refuses for good', async () => {
    const st = setup()
    queuePost(st.S, st.S.workouts[0])
    mocks.fail = Object.assign(new Error('empty'), { status: 400 })
    await flushPosts()
    expect(postState(st.S, st.S.workouts[0]).state).toBe('off')
  })

  it('does not post a workout with nothing logged', () => {
    const st = setup()
    const empty = { id: 'e', name: 'Freestyle', entries: [] }
    queuePost(st.S, empty)
    expect(postState(st.S, empty).state).toBe('none')
  })

  it('does not queue when the person switched it off', () => {
    const st = setup({ autoPost: false })
    queuePost(st.S, st.S.workouts[0])
    expect(postState(st.S, st.S.workouts[0]).state).toBe('none')
  })

  it('deletes the post with the workout, also later when offline at the time', async () => {
    const st = setup()
    queuePost(st.S, st.S.workouts[0])
    await flushPosts()
    mocks.fail = Object.assign(new Error('offline'), { status: 0 })
    forgetPost(st.S, st.S.workouts[0])
    st.S.workouts = []
    await flushPosts()
    expect(st.S.postDel).toEqual(['p1'])
    mocks.fail = null
    await flushPosts()
    expect(mocks.deleted).toEqual(['p1'])
    expect(st.S.postDel).toEqual([])
  })

  it('Undo takes the post back, and Post it puts it in the queue again', async () => {
    const st = setup()
    const w = st.S.workouts[0]
    queuePost(st.S, w)
    await flushPosts()
    unpost(st.S, w)
    expect(postState(st.S, w).state).toBe('off')
    await flushPosts()
    expect(mocks.deleted).toEqual(['p1'])
    repost(st.S, w)
    expect(postState(st.S, w).state).toBe('waiting')
  })

  it('a workout deleted before its post went out is simply forgotten', async () => {
    const st = setup()
    queuePost(st.S, st.S.workouts[0])
    forgetPost(st.S, st.S.workouts[0])
    st.S.workouts = []
    await flushPosts()
    expect(mocks.posts).toHaveLength(0)
    expect(st.S.postDel || []).toEqual([])
  })

  it('a title, description and photos written before the post went out go out with it', async () => {
    const st = setup()
    const w = st.S.workouts[0]
    queuePost(st.S, w)
    mocks.fail = Object.assign(new Error('offline'), { status: 0 })
    await flushPosts()
    setPostDetails(st.S, w, { title: 'Bench day', text: 'New PR!', photos: ['ph1'] })
    expect(st.S.workouts[0].name).toBe('Bench day')
    mocks.fail = null
    await flushPosts()
    expect(mocks.posts[0]).toMatchObject({ text: 'New PR!', photos: ['ph1'] })
    expect(mocks.posts[0].workout.name).toBe('Bench day')
    expect(postDetails(st.S, w)).toBe(null)
  })

  it('written after the post was made, they change the post', async () => {
    const st = setup()
    const w = st.S.workouts[0]
    queuePost(st.S, w)
    await flushPosts()
    setPostDetails(st.S, w, { title: 'Chest day', text: 'Felt strong', photos: [] })
    await flushPosts()
    expect(mocks.posts).toHaveLength(1)
    expect(mocks.posts[0]).toMatchObject({ text: 'Felt strong' })
    expect(mocks.posts[0].workout.name).toBe('Chest day')
    expect(postDetails(st.S, w)).toBe(null)
  })

  it('writing a post for a workout that was taken back posts it again', async () => {
    const st = setup()
    const w = st.S.workouts[0]
    queuePost(st.S, w)
    await flushPosts()
    unpost(st.S, w)
    await flushPosts()
    setPostDetails(st.S, w, { title: 'Again', text: 'x' })
    expect(postState(st.S, w).state).toBe('waiting')
  })
})
