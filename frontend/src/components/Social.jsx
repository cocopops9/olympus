// Olympus social pieces shared by the feed, the profile screens and the workout sheets:
// avatars, a post with its likes and comments, a person row with a follow button, and the
// sheets for writing a post, editing a bio and listing followers.
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
  deleteComment, setFollow, saveBio, fetchConnections, socialErrorText,
} from '../lib/social.js'
import { Button, TextArea, TextField, SelectRow } from './ui.jsx'
import Icon from './Icon.jsx'
import '../social.css'

/** Fired on window with the new post as `detail` whenever this device publishes one. */
export const POSTED_EVENT = 'olympus:posted'
const toast = m => useUI.getState().toast(m)
// A small confirm of our own: sheets.jsx imports this module, so importing its confirmSheet back
// would make the two depend on each other.
function confirmAction({ title, message, confirmText, onConfirm }) {
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

export function Avatar({ user, size }) {
  return <span className={'avatar' + (size ? ' ' + size : '')} style={{ '--h': hueOf(user?.id) }} aria-hidden="true">
    {initialsOf(user?.name)}
  </span>
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

export function PostCard({ post, onChange, onDelete }) {
  const nav = useNavigate()
  const me = useStore(s => s.user)
  const [showComments, setShowComments] = useState(false)
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
        <div className="post-name">{post.author.name}</div>
        <div className="post-ago">{fmtAgo(post.ts)}</div>
      </button>
      {(post.mine || me?.admin) && <button className="iconbtn" onClick={remove} aria-label={t('Delete post')}><Icon name="trash" /></button>}
    </div>
    {post.text && <p className="post-text">{post.text}</p>}
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
        <div className="cmt-b"><b onClick={() => openAuthor(c.author.id)}>{c.author.name}</b>{c.text}
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

export function FollowButton({ user, onChange, size = 'sm' }) {
  const [busy, setBusy] = useState(false)
  if (!user || user.me) return null
  const toggle = async e => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try { onChange?.(await setFollow(user.id, !user.isFollowing)) } catch (err) { fail(err) } finally { setBusy(false) }
  }
  return <Button size={size} variant={user.isFollowing ? 'plain' : 'primary'} disabled={busy} onClick={toggle}>
    {user.isFollowing ? t('Following') : t('Follow')}
  </Button>
}

export function PersonRow({ user, onChange, onOpen }) {
  const nav = useNavigate()
  const open = () => { onOpen?.(); nav(user.me ? '/profile' : '/u/' + user.id) }
  return <div className="person" role="button" tabIndex={0} onClick={open} onKeyDown={e => { if (e.key === 'Enter') open() }}>
    <Avatar user={user} />
    <div className="person-m">
      <div className="person-n">{user.name}</div>
      <div className="person-s">{user.bio || [tn('{0} follower', '{0} followers', user.followers), tn('{0} post', '{0} posts', user.posts)].join(' · ')}</div>
    </div>
    <FollowButton user={user} onChange={onChange} />
  </div>
}

/* ---------------- sheets ---------------- */

function Composer({ close, workout, onPosted }) {
  const S = useStore(s => s.S)
  const recent = S.workouts.slice(-12).reverse()
  const [text, setText] = useState('')
  const [pick, setPick] = useState(() => (workout ? workout.id || '__given' : ''))
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  const chosen = workout && (pick === (workout.id || '__given')) ? workout : recent.find(w => w.id === pick) || null
  const summary = chosen ? summaryOf(chosen, S) : null
  const options = [
    { value: '', label: t('No workout') },
    ...(workout && !recent.some(w => w.id === workout.id) ? [{ value: workout.id || '__given', label: workout.name || t('Workout') }] : []),
    ...recent.map(w => ({ value: w.id, label: `${w.name || t('Workout')} · ${fmtDate(w.d, true)}` })),
  ]
  const submit = async () => {
    if (busy || (!text.trim() && !summary)) return
    setBusy(true)
    try {
      const post = await createPost({ text: text.trim(), workout: summary })
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
    <div style={{ height: 10 }} />
    {recent.length > 0 || workout
      ? <SelectRow icon="dumbbell" title={t('Attach a workout')} value={pick} options={options} onChange={setPick} sheetTitle={t('Attach a workout')} />
      : <p className="small muted">{t('Finish a workout to attach it to a post.')}</p>}
    {summary && <div style={{ marginTop: 10 }}><WorkoutSummary workout={summary} limit={3} /></div>}
    <div style={{ height: 12 }} />
    <Button variant="primary" icon="share" disabled={busy || (!text.trim() && !summary)} onClick={submit}>{t('Post')}</Button>
  </>
}
/** Write a post; `workout` (a logged workout) is attached when given. */
export const composeSheet = ({ workout, onPosted } = {}) =>
  useUI.getState().openSheet(close => <Composer close={close} workout={workout} onPosted={onPosted} />)

function BioEditor({ close, bio, onSaved }) {
  const [text, setText] = useState(bio || '')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try { onSaved?.(await saveBio(text.trim())); close() } catch (e) { fail(e); setBusy(false) }
  }
  return <>
    <h3>{t('Edit profile')}</h3>
    <div className="small muted" style={{ marginBottom: 6 }}>{t('Bio')}</div>
    <TextArea rows={3} maxLength={160} value={text} placeholder={t('Goals, sport, the gym you train at…')} onChange={e => setText(e.target.value)} />
    <div className="small dim" style={{ textAlign: 'end', margin: '4px 2px 12px' }}>{text.length}/160</div>
    <Button variant="primary" disabled={busy} onClick={save}>{t('Save')}</Button>
  </>
}
export const bioSheet = (bio, onSaved) => useUI.getState().openSheet(close => <BioEditor close={close} bio={bio} onSaved={onSaved} />)

function Connections({ close, id, kind }) {
  const [users, setUsers] = useState(null)
  useEffect(() => { fetchConnections(id, kind).then(setUsers, e => { fail(e); setUsers([]) }) }, [id, kind])
  const update = u => setUsers(list => list.map(x => (x.id === u.id ? u : x)))
  return <>
    <h3>{kind === 'following' ? t('Following') : t('Followers')}</h3>
    {users === null ? <div className="empty">{t('Loading…')}</div>
      : users.length ? users.map(u => <PersonRow key={u.id} user={u} onChange={update} onOpen={close} />)
        : <div className="empty">{kind === 'following' ? t('Not following anyone yet.') : t('No followers yet.')}</div>}
  </>
}
export const connectionsSheet = (id, kind) => useUI.getState().openSheet(close => <Connections close={close} id={id} kind={kind} />)
