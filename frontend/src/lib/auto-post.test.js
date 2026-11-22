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
  createPost: vi.fn(async ({ wid, workout, text, photos, video }) => {
    if (mocks.fail) throw mocks.fail
    const had = mocks.posts.find(p => p.wid === wid)
    if (had) return had
    const p = { id: 'p' + (mocks.posts.length + 1), wid, workout, text, photos, ...(video ? { video } : {}) }
    mocks.posts.push(p)
    return p
  }),
  deletePost: vi.fn(async id => { if (mocks.fail) throw mocks.fail; mocks.deleted.push(id); return { ok: true } }),
  editPost: vi.fn(async ({ id, text, photos, workout, video }) => {
    if (mocks.fail) throw mocks.fail
    const p = mocks.posts.find(x => x.id === id)
    if (!p) throw Object.assign(new Error('gone'), { status: 404 })
    Object.assign(p, { text, photos, workout })
    if (video === null) delete p.video; else if (video) p.video = video
    return p
  }),
}))
import { coverOf } from './workout-cover.js'
import { queuePost, forgetPost, flushPosts, postState, unpost, repost, setPostDetails, postDetails, stalePosts, refreshPost } from './auto-post.js'
import { editPost } from './social.js'
import { stampWorkout } from './sync-merge.js'

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

  it('a video written for the post goes out with it, and takes the photos\' place', async () => {
    const st = setup()
    const w = st.S.workouts[0]
    queuePost(st.S, w)
    mocks.fail = Object.assign(new Error('offline'), { status: 0 })
    await flushPosts()
    setPostDetails(st.S, w, { text: 'Squats', photos: ['ph1'], video: { id: 'v1', secs: 12.4 } })
    expect(st.S.wpostEdit.w1).toMatchObject({ photos: [], video: { id: 'v1', secs: 12 } })
    mocks.fail = null
    await flushPosts()
    expect(mocks.posts[0]).toMatchObject({ text: 'Squats', photos: [], video: { id: 'v1', secs: 12 } })
    expect(postDetails(st.S, w)).toBe(null)
  })

  it('a video on the post becomes the workout cover; removing it clears the cover', async () => {
    const st = setup()
    const w = st.S.workouts[0]
    queuePost(st.S, w)
    await flushPosts()
    setPostDetails(st.S, w, { text: 'a', video: { id: 'v7', secs: 5 } })
    expect(coverOf(w.id)).toBe('~v7')
    setPostDetails(st.S, w, { text: 'a', video: null })
    expect(coverOf(w.id)).toBe(null)
  })

  it('a video taken off an existing post, and one never touched, are told apart', async () => {
    const st = setup()
    const w = st.S.workouts[0]
    queuePost(st.S, w)
    await flushPosts()
    setPostDetails(st.S, w, { text: 'a', video: { id: 'v2', secs: 5 } })
    await flushPosts()
    expect(mocks.posts[0].video).toEqual({ id: 'v2', secs: 5 })
    setPostDetails(st.S, w, { text: 'b' })   // the editor did not touch the video: it stays
    expect('video' in st.S.wpostEdit.w1).toBe(false)
    await flushPosts()
    expect(mocks.posts[0].video).toEqual({ id: 'v2', secs: 5 })
    setPostDetails(st.S, w, { text: 'c', video: null })
    await flushPosts()
    expect(mocks.posts[0].video).toBeUndefined()
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

// A workout edited after it was posted, from the post's pencil or the history: the post's card
// follows the edit, and what was written for the post stays the server's.
describe('a posted workout edited afterwards', () => {
  beforeEach(() => { mocks.posts = []; mocks.deleted = []; mocks.fail = null; editPost.mockClear() })
  const edited = (S, fn) => {
    const next = structuredClone(S)
    const w = next.workouts[0]
    fn(w)
    stampWorkout(w, (S.workouts[0]._ts || 0) + 1)
    return next
  }

  it('finds the post whose card changed: sets, duration, a removed exercise', () => {
    const S = { unit: 'kg', workouts: [workout('w1')], wposts: { w1: 'p1' } }
    expect(stalePosts(S, edited(S, w => { w.entries[0].sets[0].w = 70 }))).toEqual(['w1'])
    expect(stalePosts(S, edited(S, w => { w.end += 600000 }))).toEqual(['w1'])
    expect(stalePosts(S, edited(S, w => { w.entries.push({ id: '0032', sets: [{ w: 20, r: 10, done: true }] }) }))).toEqual(['w1'])
  })

  it('leaves alone a note-only edit, an unstamped copy, and workouts not posted', () => {
    const S = { unit: 'kg', workouts: [workout('w1')], wposts: { w1: 'p1' } }
    expect(stalePosts(S, edited(S, w => { w.note = 'felt good' }))).toEqual([])
    const unstamped = structuredClone(S); unstamped.workouts[0].end += 600000
    expect(stalePosts(S, unstamped)).toEqual([])
    for (const v of [undefined, '', '-']) {
      const T = { ...S, wposts: v === undefined ? {} : { w1: v } }
      expect(stalePosts(T, edited(T, w => { w.end += 600000 }))).toEqual([])
    }
  })

  it('sends the new card without touching the text, photos, song or video', async () => {
    const st = setup()
    queuePost(st.S, st.S.workouts[0])
    await flushPosts()
    st.S.workouts[0].entries[0].sets[0].w = 80
    refreshPost(st.S, 'w1')
    expect(postDetails(st.S, st.S.workouts[0])).toEqual({})
    await flushPosts()
    const args = editPost.mock.calls.at(-1)[0]
    expect(args.id).toBe('p1')
    expect(args.workout.exercises[0].best).toContain('80')
    expect(args.text).toBeUndefined()
    expect(args.photos).toBeUndefined()
    expect('song' in args).toBe(false)
    expect('video' in args).toBe(false)
    expect(postDetails(st.S, st.S.workouts[0])).toBe(null)
  })

  it('does not overwrite a post edit still waiting to go out', () => {
    const st = setup({ wposts: { w1: 'p1' } })
    setPostDetails(st.S, st.S.workouts[0], { title: 'Chest', text: 'great day', photos: [] })
    refreshPost(st.S, 'w1')
    expect(postDetails(st.S, st.S.workouts[0]).text).toBe('great day')
  })

  it('a card-only request for a post not out yet is spent by the post itself', async () => {
    const st = setup()
    queuePost(st.S, st.S.workouts[0])
    refreshPost(st.S, 'w1')
    await flushPosts()
    expect(mocks.posts).toHaveLength(1)
    expect(editPost).not.toHaveBeenCalled()
    expect(postDetails(st.S, st.S.workouts[0])).toBe(null)
  })
})
