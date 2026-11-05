// Olympus: the short video of a post. "Add a video" opens the phone's own picker; a sheet then lets
// the person choose the part to share (30 seconds at most) and shrinks it on the phone before it
// goes up (lib/video.js). On a post the video waits behind its cover and its length and is fetched
// only when it is played, so a feed of videos does not download every one of them. It replaces the
// post's photos: a post has photos or a video.
import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { videoBlob } from '../lib/social.js'
import { openVideo, prepareVideo, uploadVideo, defaultVideoRange, MAX_VIDEO_SEC, MIN_VIDEO_SEC } from '../lib/video.js'
import { RangeTrim, RangeLabel, clock } from './Song.jsx'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import '../video.css'

const toast = msg => useUI.getState().toast(msg)
const LIMITS = { minLen: MIN_VIDEO_SEC, maxLen: MAX_VIDEO_SEC }
const videoError = e => (e?.code === 'video-file-large' ? t('That video is too large to open. Pick one under 600 MB.')
  : e?.code === 'video-unreadable' ? t('This phone cannot play that video.')
    : e?.code === 'video-unsupported' ? t('This phone cannot shrink a video for sharing. Pick one under 3 MB and 30 seconds.')
      : e?.code === 'video-too-big' ? t('The clip is too big to share. Pick a shorter part.')
        : e?.status === 413 ? t('That video is too large.') : e?.status == null ? t('The server could not be reached.') : (e?.message || t('Something went wrong.')))

// The one video playing anywhere in the app: starting another stops it.
let playing = null

/** The sheet that cuts and sends a video: `opened` comes from lib/video.js openVideo(file). */
function VideoSheet({ file, opened, close, onPicked }) {
  const max = Math.floor(opened.duration * 10) / 10
  const [range, setRange] = useState(() => defaultVideoRange(opened.duration))
  const [progress, setProgress] = useState(null)   // null, or 0..1 while the video is prepared
  const [watching, setWatching] = useState(false)
  const view = useRef(null)
  const alive = useRef(true)
  const stopView = () => { try { view.current?.pause() } catch { /* gone */ } setWatching(false) }
  useEffect(() => () => { alive.current = false; opened.dispose() }, [])
  const change = r => { stopView(); setRange(r) }
  // The preview plays the chosen part, with its sound, and stops at its end.
  const watch = () => {
    const v = view.current
    if (!v) return
    if (watching) { stopView(); return }
    v.currentTime = range.start
    v.muted = false
    v.play().then(() => setWatching(true), () => setWatching(false))
  }
  const onTime = () => { const v = view.current; if (v && !v.paused && v.currentTime >= range.end - 0.05) stopView() }
  const use = async () => {
    stopView(); setProgress(0)
    try {
      const { blob, secs } = await prepareVideo(file, opened, range, { onProgress: p => alive.current && setProgress(Math.min(0.99, p)) })
      if (alive.current) setProgress(1)
      const id = await uploadVideo(blob)
      if (!alive.current) return
      onPicked({ id, secs, url: URL.createObjectURL(blob) })
      close()
    } catch (e) { if (alive.current) { toast(videoError(e)); setProgress(null) } }
  }
  const busy = progress !== null
  const len = range.end - range.start
  return <div className="vid-sheet">
    <h3>{t('Your workout video')}</h3>
    <p className="small muted">{t('Choose the part of the video to share, up to {0} seconds.', MAX_VIDEO_SEC)}</p>
    <div className="vid-view">
      <video ref={view} src={opened.url} playsInline preload="metadata" onTimeUpdate={onTime} onEnded={stopView} onPause={() => setWatching(false)} />
      {!watching && <button className="vid-big" onClick={watch} disabled={busy} aria-label={t('Watch')}><Icon name="play" /></button>}
    </div>
    <RangeLabel range={range} id="vid-start" />
    <RangeTrim id="vid-start" max={max} step={0.5} value={range} onChange={change} disabled={busy} limits={LIMITS} />
    <div className="song-ends small muted"><span>0:00</span><span>{clock(opened.duration)}</span></div>
    {opened.duration > MAX_VIDEO_SEC && <p className="small muted">{t('Up to {0} seconds of a video can be shared.', MAX_VIDEO_SEC)}</p>}
    {len > 0 && busy && <p className="small muted">{t('Keep this screen open while the video is prepared.')}</p>}
    <div className="song-a">
      <Button icon={watching ? 'pause' : 'play'} disabled={busy} onClick={watch}>{watching ? t('Stop') : t('Watch')}</Button>
      <Button variant="primary" icon="check" disabled={busy || len < MIN_VIDEO_SEC} onClick={use}>{!busy ? t('Use this video') : progress >= 1 ? t('Uploading the video…') : t('Preparing the video… {0}%', Math.round(progress * 100))}</Button>
    </div>
  </div>
}

/** A video of a post that is still being written: its own cover from the phone, and a button to take it off. */
function ChosenVideo({ value, onRemove }) {
  return <div className="vid-chosen">
    <video src={value.url} preload="metadata" muted playsInline />
    <span className="vid-len">{clock(value.secs || 0)}</span>
    <button className="cmp-ph-x" onClick={onRemove} aria-label={t('Remove video')}><Icon name="xmark" /></button>
  </div>
}

/**
 * The video of a post being written. `value` is { id, secs, url } or null; `onChange` gets the
 * same. `disabled` while the post has photos (a post has photos or a video).
 */
export function VideoField({ value, onChange, disabled, size }) {
  const input = useRef(null)
  const [reading, setReading] = useState(false)
  const remove = () => { if (value?.url) URL.revokeObjectURL(value.url); onChange(null) }
  const pick = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { toast(t('A video needs a connection. Add it once you are back online.')); return }
    setReading(true)
    try {
      const opened = await openVideo(file)
      useUI.getState().openSheet(close => <VideoSheet file={file} opened={opened} close={close}
        onPicked={v => { if (value?.url) URL.revokeObjectURL(value.url); onChange(v) }} />)
    } catch (err) { toast(videoError(err)) } finally { setReading(false) }
  }
  return <>
    <input ref={input} type="file" accept="video/*" style={{ display: 'none' }} onChange={pick} data-testid="video-file" />
    {value?.id
      ? (value.url ? <ChosenVideo value={value} onRemove={remove} /> : <PostedVideo video={value} onRemove={remove} />)
      : <Button size={size} icon="video" disabled={disabled || reading} onClick={() => input.current?.click()}>
        {reading ? t('Reading the video…') : t('Add a video')}</Button>}
  </>
}

/** A video already on the server, in the editor of a post: its cover and length, with a button to take it off. */
function PostedVideo({ video, onRemove }) {
  return <div className="vid-chosen vid-posted">
    <span className="vid-big static"><Icon name="video" /></span>
    <span className="vid-len">{clock(video.secs || 0)}</span>
    <button className="cmp-ph-x" onClick={onRemove} aria-label={t('Remove video')}><Icon name="xmark" /></button>
  </div>
}

/** A post's video: a cover with a play button and its length; the clip is fetched when it is played. */
export function PostVideo({ video }) {
  const [state, setState] = useState('idle')   // idle | loading | ready | failed
  const [url, setUrl] = useState(null)
  const el = useRef(null)
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); if (playing === el.current) playing = null }, [url])
  if (!video?.id) return null
  const start = async () => {
    if (state === 'loading') return
    if (url) { el.current?.play(); return }
    setState('loading')
    try {
      const b = await videoBlob(video.id)
      setUrl(URL.createObjectURL(b))
      setState('ready')
    } catch { setState('failed') }
  }
  const onPlay = () => { if (playing && playing !== el.current) { try { playing.pause() } catch { /* gone */ } } playing = el.current }
  return <div className={'vid-post ' + state}>
    {url
      ? <video ref={el} src={url} controls playsInline autoPlay preload="auto" onPlay={onPlay} onLoadedMetadata={() => el.current?.play().catch(() => {})} />
      : <button className="vid-cover" onClick={start} aria-label={t('Play video')}>
        <span className="vid-big static">{state === 'loading' ? <i className="vid-spin" /> : <Icon name={state === 'failed' ? 'reset' : 'play'} />}</span>
        <span className="vid-len">{state === 'failed' ? t('Tap to try again') : clock(video.secs || 0)}</span>
      </button>}
  </div>
}
