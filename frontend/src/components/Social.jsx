// Olympus social pieces shared by the feed, the profile screens and the workout sheets:
// avatars, a post with its photos, likes and comments, a person row with a follow button, and
// the sheets for writing a post, editing your profile (bio, private, notifications, blocked
// people), viewing a photo and listing followers.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn, exerciseNameFor } from '../lib/i18n.js'
import { fmtAgo, fmtDate, fmtDur, fmtVol, fmtNum } from '../lib/format.js'
import { EXIDX } from '../lib/exercises.js'
import { speedUnitOf } from '../lib/speed.js'
import {
  initialsOf, hueOf, workoutPostSummary, createPost, deletePost, setLike, addComment,
  deleteComment, setFollow, saveProfile, fetchConnections, socialErrorText, followLabel,
  uploadPhoto, photoBlob, fetchBlocked, setBlock, removeFollower, avatarUrl,
} from '../lib/social.js'
import { preparePhoto, prepareAvatar } from '../lib/social-photo.js'
import { Button, TextArea, TextField, SelectRow, Section, Row, Switch } from './ui.jsx'
import Icon from './Icon.jsx'
import { AccountSection } from './AccountEdit.jsx'
import '../social.css'

/** Fired on window with the new post as `detail` whenever this device publishes one. */
export const POSTED_EVENT = 'olympus:posted'
const MAX_PHOTOS = 4
const toast = m => useUI.getState().toast(m)
// A small confirm of our own: sheets.jsx imports this module, so importing its confirmSheet back
// would make the two depend on each other.
export function confirmAction({ title, message, confirmText, onConfirm }) {
  useUI.getState().openSheet(close => <>
    <h3>{title}</h3>
    <p className="muted">{message}</p>
    <Button variant="danger" onClick={() => { close(); onConfirm() }}>{confirmText}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>, { kind: 'center' })
}
const fail = e => toast(socialErrorText(e, t))
const nameOfEntry = e => (EXIDX[e.id] ? exerciseNameFor(EXIDX[e.id]) : (e.n || e.id))

/** A logged workout as the summary a post carries, in the profile's own units and names. */
export const summaryOf = (w, S) => workoutPostSummary(w, { unit: S.unit, nameOf: nameOfEntry, speedUnit: speedUnitOf(S) })

// The profile picture when there is one and it has loaded; the coloured initials until then,
// and for good if it cannot be fetched.
export function Avatar({ user, size }) {
  const id = user?.avatar || null
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let live = true
    setUrl(null)
    if (id) avatarUrl(id).then(u => { if (live) setUrl(u) }, () => {})
    return () => { live = false }
  }, [id])
  return <span className={'avatar' + (size ? ' ' + size : '') + (url ? ' ph' : '')} style={{ '--h': hueOf(user?.id) }} aria-hidden="true">
    {url ? <img src={url} alt="" /> : initialsOf(user?.name)}
  </span>
}

// The founder's seal: a gold rosette with a check, the shape people read as "verified".
export function FounderBadge() {
  return <svg className="founder-badge" viewBox="0 0 24 24" role="img" aria-label={t('Founder of Olympus')}>
    <title>{t('Founder of Olympus')}</title>
    <defs><linearGradient id="fb-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#ffe68a" /><stop offset=".5" stopColor="#f2b705" /><stop offset="1" stopColor="#c98a00" />
    </linearGradient></defs>
    <path fill="url(#fb-gold)" d="M12 1.6l2.3 1.7 2.8-.4 1.1 2.6 2.6 1.1-.4 2.8 1.7 2.3-1.7 2.3.4 2.8-2.6 1.1-1.1 2.6-2.8-.4L12 22.4l-2.3-1.7-2.8.4-1.1-2.6-2.6-1.1.4-2.8L1.9 12l1.7-2.3-.4-2.8 2.6-1.1 1.1-2.6 2.8.4Z" />
    <path d="m7.6 12.3 3 3 5.8-6.2" fill="none" stroke="#3a2600" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

/** A person's name; the founder's in gold with the seal after it. */
export function Name({ user }) {
  if (!user) return null
  return user.founder
    ? <span className="uname founder"><span className="uname-t">{user.name}</span><FounderBadge /></span>
    : <>{user.name}</>
}

/** Pick a new profile picture (or remove it); `onSaved` gets your profile as it now is. */
export function avatarSheet(me, onSaved) {
  const pick = () => {
    // In the page while the picker is open: some WebViews ignore a click on a detached input.
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.style.display = 'none'
    document.body.appendChild(input)
    input.onchange = async () => {
      const f = input.files && input.files[0]
      input.remove()
      if (!f) return
      toast(t('Uploading photo…'))
      try {
        const id = await uploadPhoto(await prepareAvatar(f))
        onSaved?.(await saveProfile({ avatar: id }))
        toast(t('Profile picture updated'))
      } catch (e) { fail(e) }
    }
    input.click()
  }
  if (!me?.avatar) { pick(); return }
  useUI.getState().openSheet(close => <>
    <h3>{t('Profile picture')}</h3>
    <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 16px' }}><Avatar user={me} size="xl" /></div>
    <Button variant="primary" icon="camera" onClick={() => { close(); pick() }}>{t('Choose a new photo')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="danger" icon="trash" onClick={() => {
      close()
      saveProfile({ avatar: null }).then(u => { onSaved?.(u); toast(t('Profile picture removed')) }, fail)
    }}>{t('Remove photo')}</Button>
  </>)
}

/* ---------------- photos ---------------- */

// A photo of a post, fetched with the session (an <img src> could not carry the paired phone's
// token) and shown from a local object URL, which is released when the photo leaves the screen.
function usePhotoUrl(id) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true, made = null
    photoBlob(id).then(b => { if (!live) return; made = URL.createObjectURL(b); setUrl(made) }, () => { if (live) setFailed(true) })
    return () => { live = false; if (made) URL.revokeObjectURL(made) }
  }, [id])
  return { url, failed }
}

function PostPhoto({ id, onOpen }) {
  const { url, failed } = usePhotoUrl(id)
  return <button className="post-ph" onClick={() => url && onOpen(url)} aria-label={t('Open photo')}>
    {url ? <img src={url} alt="" /> : <span className="post-ph-x">{failed ? <Icon name="image" /> : null}</span>}
  </button>
}

export function PostPhotos({ ids }) {
  if (!ids || !ids.length) return null
  const open = url => useUI.getState().openSheet(() => <img className="ph-full" src={url} alt="" />)
  return <div className={'post-phs n' + Math.min(ids.length, MAX_PHOTOS)}>
    {ids.slice(0, MAX_PHOTOS).map(id => <PostPhoto key={id} id={id} onOpen={open} />)}
  </div>
}

/* ---------------- a workout inside a post ---------------- */

export function WorkoutSummary({ workout, limit = 5 }) {
  const [open, setOpen] = useState(false)
  if (!workout) return null
  const ex = workout.exercises || []
  const shown = open ? ex : ex.slice(0, limit)
  const stats = [
    ...(workout.durMs >= 60000 ? [[t('Duration'), fmtDur(workout.durMs)]] : []),
    [t('Volume'), fmtVol(workout.vol || 0, workout.unit || 'kg')],
    [t('Sets'), fmtNum(workout.sets || 0)],
    ...(workout.prs ? [[t('PRs'), fmtNum(workout.prs)]] : []),
  ]
  return <div className="post-w">
    <div className="post-w-t"><Icon name="dumbbell" />{workout.name || t('Workout')}
      {workout.d && <span className="post-ago" style={{ fontWeight: 400, marginInlineStart: 'auto' }}>{fmtDate(workout.d, true)}</span>}
    </div>
    <div className="post-stats">
      {stats.map(([l, v]) => <div key={l} className="post-stat"><div className="l">{l}</div><div className="v">{v}</div></div>)}
    </div>
    {shown.map((e, i) => <div key={i} className="post-ex">
      <span className="n">{e.sets} × {e.n}</span><span className="b">{e.best}</span>
    </div>)}
    {ex.length > limit && <button className="post-more btn ghost" style={{ padding: '5px 0' }} onClick={() => setOpen(o => !o)}>
      {open ? t('Show less') : tn('{0} more exercise', '{0} more exercises', ex.length - limit)}
    </button>}
  </div>
}

/* ---------------- a post ---------------- */

export function PostCard({ post, onChange, onDelete, commentsOpen = false }) {
  const nav = useNavigate()
  const me = useStore(s => s.user)
  const [showComments, setShowComments] = useState(commentsOpen)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const replace = p => p && onChange?.(p)

  const toggleLike = async () => {
    // Shown at once; put back if the server says no.
    const optimistic = { ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) }
    onChange?.(optimistic)
    try { replace(await setLike(post.id, !post.liked)) } catch (e) { onChange?.(post); fail(e) }
  }
  const send = async () => {
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    try { replace(await addComment(post.id, text)); setDraft('') } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const removeComment = async c => {
    try { replace(await deleteComment(post.id, c.id)) } catch (e) { fail(e) }
  }
  const remove = () => confirmAction({
    title: t('Delete post?'), message: t('It disappears from every feed. Your workout itself stays in your history.'),
    confirmText: t('Delete'),
    onConfirm: async () => {
      try { await deletePost(post.id); onDelete?.(post); toast(t('Post deleted')) } catch (e) { fail(e) }
    },
  })
  const openAuthor = id => nav(id === me?.id ? '/profile' : '/u/' + id)

  return <article className="post">
    <div className="post-h">
      <Avatar user={post.author} />
      <button className="post-who" onClick={() => openAuthor(post.author.id)}>
        <div className="post-name"><Name user={post.author} /></div>
        <div className="post-ago">{fmtAgo(post.ts)}</div>
      </button>
      {(post.mine || me?.admin) && <button className="iconbtn" onClick={remove} aria-label={t('Delete post')}><Icon name="trash" /></button>}
    </div>
    {post.text && <p className="post-text">{post.text}</p>}
    <PostPhotos ids={post.photos} />
    <WorkoutSummary workout={post.workout} />
    <div className="post-a">
      <button className={post.liked ? 'liked' : ''} onClick={toggleLike} aria-pressed={post.liked}
        aria-label={post.liked ? t('Unlike') : t('Like')}>
        <Icon name="heart" style={post.liked ? { fill: 'currentColor' } : undefined} />{post.likes > 0 && <span>{post.likes}</span>}
      </button>
      <button onClick={() => setShowComments(v => !v)} aria-expanded={showComments} aria-label={t('Comments')}>
        <Icon name="chat" />{post.comments.length > 0 && <span>{post.comments.length}</span>}
      </button>
    </div>
    {showComments && <div className="post-c">
      {post.comments.map(c => <div key={c.id} className="cmt">
        <Avatar user={c.author} size="sm" />
        <div className="cmt-b"><b onClick={() => openAuthor(c.author.id)}><Name user={c.author} /></b>{c.text}
          <div className="post-ago">{fmtAgo(c.ts)}</div></div>
        {(c.mine || post.mine) && <button className="cmt-x" onClick={() => removeComment(c)} aria-label={t('Delete comment')}><Icon name="xmark" /></button>}
      </div>)}
      <div className="cmt-in">
        <TextField value={draft} maxLength={500} placeholder={t('Add a comment…')} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send() } }} />
        <Button size="sm" variant="tinted" disabled={!draft.trim() || busy} onClick={send}>{t('Send')}</Button>
      </div>
    </div>}
  </article>
}

/* ---------------- a person ---------------- */

// Follow, Following, or Requested for a private profile that has not answered yet. Tapping
// Following or Requested takes it back.
export function FollowButton({ user, onChange, size = 'sm' }) {
  const [busy, setBusy] = useState(false)
  if (!user || user.me || user.blockedByMe) return null
  const on = user.isFollowing || user.requested
  const toggle = async e => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try { onChange?.(await setFollow(user.id, !on)) } catch (err) { fail(err) } finally { setBusy(false) }
  }
  return <Button size={size} variant={on ? 'plain' : 'primary'} disabled={busy} onClick={toggle}>{followLabel(user, t)}</Button>
}

export function PersonRow({ user, onChange, onOpen, action }) {
  const nav = useNavigate()
  const open = () => { onOpen?.(); nav(user.me ? '/profile' : '/u/' + user.id) }
  return <div className="person" role="button" tabIndex={0} onClick={open} onKeyDown={e => { if (e.key === 'Enter') open() }}>
    <Avatar user={user} />
    <div className="person-m">
      <div className="person-n"><Name user={user} />{user.private && <Icon name="lock" className="person-lock" aria-label={t('Private profile')} />}</div>
      <div className="person-s">{user.bio || [tn('{0} follower', '{0} followers', user.followers || 0), tn('{0} post', '{0} posts', user.posts || 0)].join(' · ')}</div>
    </div>
    {action || <FollowButton user={user} onChange={onChange} />}
  </div>
}

/* ---------------- writing a post ---------------- */

function Composer({ close, workout, onPosted }) {
  const S = useStore(s => s.S)
  const recent = S.workouts.slice(-12).reverse()
  const [text, setText] = useState('')
  const [pick, setPick] = useState(() => (workout ? workout.id || '__given' : ''))
  // { key, preview (data URL), id (once uploaded) | null, failed }
  const [photos, setPhotos] = useState([])
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)
  const fileRef = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  const chosen = workout && (pick === (workout.id || '__given')) ? workout : recent.find(w => w.id === pick) || null
  const summary = chosen ? summaryOf(chosen, S) : null
  const options = [
    { value: '', label: t('No workout') },
    ...(workout && !recent.some(w => w.id === workout.id) ? [{ value: workout.id || '__given', label: workout.name || t('Workout') }] : []),
    ...recent.map(w => ({ value: w.id, label: `${w.name || t('Workout')} · ${fmtDate(w.d, true)}` })),
  ]
  const uploading = photos.some(p => !p.id && !p.failed)
  const ready = photos.filter(p => p.id).map(p => p.id)
  const empty = !text.trim() && !summary && !ready.length

  // Each picked photo is scaled, re-encoded and uploaded at once, so Post only sends ids.
  const addPhotos = async files => {
    const room = MAX_PHOTOS - photos.length
    const list = [...files].slice(0, Math.max(0, room))
    if (files.length > room) toast(tn('Up to {0} photo per post.', 'Up to {0} photos per post.', MAX_PHOTOS))
    for (const file of list) {
      const key = Math.random().toString(36).slice(2)
      let data
      try { data = await preparePhoto(file) } catch (e) { fail(e); continue }
      setPhotos(ps => [...ps, { key, preview: data, id: null, failed: false }])
      uploadPhoto(data).then(
        id => setPhotos(ps => ps.map(p => (p.key === key ? { ...p, id } : p))),
        e => { fail(e); setPhotos(ps => ps.filter(p => p.key !== key)) })
    }
  }
  const submit = async () => {
    if (busy || uploading || empty) return
    setBusy(true)
    try {
      const post = await createPost({ text: text.trim(), workout: summary, photos: ready })
      close()
      toast(t('Posted to your feed'))
      onPosted?.(post)
      // The feed listens for this, so a post written from a workout sheet shows up on Home too.
      window.dispatchEvent(new CustomEvent(POSTED_EVENT, { detail: post }))
    } catch (e) { fail(e); setBusy(false) }
  }
  return <>
    <h3>{t('New post')}</h3>
    <textarea ref={ref} className="field area" rows={4} maxLength={1000} value={text} placeholder={t('How did training go?')} onChange={e => setText(e.target.value)} />
    {photos.length > 0 && <div className="cmp-phs">
      {photos.map(p => <div key={p.key} className={'cmp-ph' + (p.id ? '' : ' busy')}>
        <img src={p.preview} alt="" />
        <button className="cmp-ph-x" onClick={() => setPhotos(ps => ps.filter(x => x.key !== p.key))} aria-label={t('Remove photo')}><Icon name="xmark" /></button>
      </div>)}
    </div>}
    <div style={{ height: 10 }} />
    <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
      onChange={e => { const f = e.target.files; if (f && f.length) addPhotos(f); e.target.value = '' }} />
    <Button icon="camera" disabled={photos.length >= MAX_PHOTOS} onClick={() => fileRef.current?.click()}>
      {photos.length ? t('Add another photo') : t('Add photos')}
    </Button>
    <div style={{ height: 8 }} />
    {recent.length > 0 || workout
      ? <SelectRow icon="dumbbell" title={t('Attach a workout')} value={pick} options={options} onChange={setPick} sheetTitle={t('Attach a workout')} />
      : <p className="small muted">{t('Finish a workout to attach it to a post.')}</p>}
    {summary && <div style={{ marginTop: 10 }}><WorkoutSummary workout={summary} limit={3} /></div>}
    <div style={{ height: 12 }} />
    <Button variant="primary" icon="share" disabled={busy || uploading || empty} onClick={submit}>
      {uploading ? t('Uploading photos…') : t('Post')}
    </Button>
  </>
}
/** Write a post; `workout` (a logged workout) is attached when given. */
export const composeSheet = ({ workout, onPosted } = {}) =>
  useUI.getState().openSheet(close => <Composer close={close} workout={workout} onPosted={onPosted} />)

/* ---------------- your profile ---------------- */

function ProfileEditor({ close, me, onSaved }) {
  const [text, setText] = useState(me?.bio || '')
  const [priv, setPriv] = useState(!!me?.private)
  const [push, setPush] = useState(me?.pushSocial !== false)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try { onSaved?.(await saveProfile({ bio: text.trim(), private: priv, pushSocial: push })); close() } catch (e) { fail(e); setBusy(false) }
  }
  const [shown, setShown] = useState(me)
  const changed = u => { setShown(m => ({ ...m, ...u })); onSaved?.(u) }
  return <>
    <h3>{t('Edit profile')}</h3>
    <button className="prof-av-edit" onClick={() => avatarSheet(shown, changed)} aria-label={t('Change profile picture')}>
      <Avatar user={shown} size="lg" />
      <span>{t('Change profile picture')}</span>
    </button>
    <div className="small muted" style={{ marginBottom: 6 }}>{t('Bio')}</div>
    <TextArea rows={3} maxLength={160} value={text} placeholder={t('Goals, sport, the gym you train at…')} onChange={e => setText(e.target.value)} />
    <div className="small dim" style={{ textAlign: 'end', margin: '4px 2px 12px' }}>{text.length}/160</div>
    <Section footer={priv
      ? t('Only the followers you accept see your posts. New followers send a request first.')
      : t('Everyone on this server can see your posts and follow you.')}>
      <Row icon="lock" iconTint="var(--indigo)" title={t('Private profile')}>
        <Switch checked={priv} onChange={setPriv} aria-label={t('Private profile')} />
      </Row>
    </Section>
    <Section footer={t('Likes, comments and new followers are always listed in the app.')}>
      <Row icon="bell" iconTint="var(--red)" title={t('Push notifications for likes, comments and follows')}>
        <Switch checked={push} onChange={setPush} aria-label={t('Push notifications for likes, comments and follows')} />
      </Row>
      <Row icon="xmark" iconTint="var(--grey)" title={t('Blocked people')} accessory="chevron" onClick={() => blockedSheet()} />
    </Section>
    <Button variant="primary" disabled={busy} onClick={save}>{t('Save')}</Button>
    <div style={{ height: 18 }} />
    <AccountSection onRenamed={n => changed({ name: n })} />
  </>
}
/** Bio, private profile, push for social events, blocked people. `me` is your social profile. */
export const profileSheet = (me, onSaved) => useUI.getState().openSheet(close => <ProfileEditor close={close} me={me} onSaved={onSaved} />)

function Blocked() {
  const [users, setUsers] = useState(null)
  useEffect(() => { fetchBlocked().then(setUsers, e => { fail(e); setUsers([]) }) }, [])
  const unblock = async u => {
    try { await setBlock(u.id, false); setUsers(list => list.filter(x => x.id !== u.id)); toast(t('{0} is unblocked', u.name)) } catch (e) { fail(e) }
  }
  return <>
    <h3>{t('Blocked people')}</h3>
    <p className="small muted">{t('They cannot find you, see your posts or follow you, and you do not see theirs.')}</p>
    {users === null ? <div className="empty">{t('Loading…')}</div>
      : users.length ? users.map(u => <div key={u.id} className="person">
        <Avatar user={u} />
        <div className="person-m"><div className="person-n"><Name user={u} /></div></div>
        <Button size="sm" onClick={() => unblock(u)}>{t('Unblock')}</Button>
      </div>) : <div className="empty">{t('You have not blocked anyone.')}</div>}
  </>
}
export const blockedSheet = () => useUI.getState().openSheet(() => <Blocked />)

/** Block or unblock `user`, asking first for a block; `onDone` gets the profile as it now is. */
export function toggleBlock(user, onDone) {
  if (user.blockedByMe) {
    setBlock(user.id, false).then(u => { onDone?.(u); toast(t('{0} is unblocked', user.name)) }, fail)
    return
  }
  confirmAction({
    title: t('Block {0}?', user.name),
    message: t('They will not be able to find you, see your posts or follow you, and you will not see theirs. Follows between you are removed. They are not told.'),
    confirmText: t('Block'),
    onConfirm: () => setBlock(user.id, true).then(u => { onDone?.(u); toast(t('{0} is blocked', user.name)) }, fail),
  })
}

/* ---------------- followers ---------------- */

function Connections({ close, id, kind, mine }) {
  const [users, setUsers] = useState(null)
  useEffect(() => { fetchConnections(id, kind).then(setUsers, e => { fail(e); setUsers([]) }) }, [id, kind])
  const update = u => setUsers(list => list.map(x => (x.id === u.id ? u : x)))
  // Your own followers can be removed: how a private profile takes access back.
  const remove = async u => {
    try { await removeFollower(u.id); setUsers(list => list.filter(x => x.id !== u.id)) } catch (e) { fail(e) }
  }
  return <>
    <h3>{kind === 'following' ? t('Following') : t('Followers')}</h3>
    {users === null ? <div className="empty">{t('Loading…')}</div>
      : users.length ? users.map(u => <PersonRow key={u.id} user={u} onChange={update} onOpen={close}
        action={mine && kind !== 'following' ? <Button size="sm" onClick={e => { e.stopPropagation(); remove(u) }}>{t('Remove')}</Button> : undefined} />)
        : <div className="empty">{kind === 'following' ? t('Not following anyone yet.') : t('No followers yet.')}</div>}
  </>
}
export const connectionsSheet = (id, kind, mine = false) => useUI.getState().openSheet(close => <Connections close={close} id={id} kind={kind} mine={mine} />)
