// Olympus: the song of a post (lib/song.js). In the post editors, "Add a song" picks an audio file
// on the phone; a sheet then shows its title (from the file's name, to change) and where the
// 30-second clip starts, with a button to listen to it, and "Use this song" uploads the clip. On
// a post, the song is a bar with its title and a play button; one song plays at a time.
import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { photoBlob } from '../lib/social.js'
import { decodeSong, clipStartMax, defaultStart, clipBlob, uploadSong, titleFromFile, CLIP_SEC } from '../lib/song.js'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import '../song.css'

const clock = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0')
const toast = msg => useUI.getState().toast(msg)
const songError = e => (e?.code === 'song-file-large' ? t('That file is too large. Pick a song under 40 MB.')
  : e?.code === 'song-unreadable' || e?.code === 'song-unsupported' ? t('This file could not be read as a song.')
    : e?.status === 413 ? t('That clip is too large.') : e?.status == null ? t('The server could not be reached.') : (e?.message || t('Something went wrong.')))

// The one song playing anywhere in the app: starting another stops it.
let playing = null

/** A post's song: its title and a play button. The clip is fetched the first time it is played. */
export function SongBar({ song }) {
  const [state, setState] = useState('idle')   // idle | loading | playing | failed
  const audio = useRef(null)
  const url = useRef(null)
  useEffect(() => () => {
    if (audio.current) { audio.current.pause(); if (playing === audio.current) playing = null }
    if (url.current) URL.revokeObjectURL(url.current)
  }, [])
  if (!song?.id) return null
  const toggle = async e => {
    e.stopPropagation()
    if (state === 'playing') { audio.current?.pause(); return }
    try {
      if (!audio.current) {
        setState('loading')
        const blob = await photoBlob(song.id)
        url.current = URL.createObjectURL(blob)
        const a = new Audio(url.current)
        a.onplay = () => setState('playing')
        a.onpause = a.onended = () => { setState('idle'); if (playing === a) playing = null }
        audio.current = a
      }
      if (playing && playing !== audio.current) playing.pause()
      playing = audio.current
      await audio.current.play()
    } catch { setState('failed') }
  }
  return <button className={'song-bar' + (state === 'playing' ? ' on' : '')} onClick={toggle}
    aria-label={(state === 'playing' ? t('Pause') : t('Play')) + ': ' + (song.title || t('Song'))}>
    <span className="song-play"><Icon name={state === 'playing' ? 'pause' : state === 'failed' ? 'xmark' : 'play'} /></span>
    <span className="song-t"><Icon name="music" />{song.title || t('Song')}</span>
    <span className={'song-eq' + (state === 'playing' ? ' on' : '')} aria-hidden="true"><i /><i /><i /><i /></span>
  </button>
}

function SongSheet({ file, decoded, close, onPicked }) {
  const max = clipStartMax(decoded.duration)
  const [title, setTitle] = useState(() => titleFromFile(file.name))
  const [start, setStart] = useState(() => defaultStart(decoded.duration))
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const preview = useRef(null)
  const stop = () => { if (preview.current) { preview.current.a.pause(); URL.revokeObjectURL(preview.current.url); preview.current = null } setListening(false) }
  useEffect(() => stop, [])
  const listen = () => {
    if (listening) { stop(); return }
    const url = URL.createObjectURL(clipBlob(decoded.buffer, start))
    const a = new Audio(url)
    a.onended = stop
    preview.current = { a, url }
    setListening(true)
    a.play().catch(stop)
  }
  const use = async () => {
    stop(); setBusy(true)
    try {
      const id = await uploadSong(decoded.buffer, start)
      onPicked({ id, title: title.trim().slice(0, 80) || titleFromFile(file.name) || t('Song') })
      close()
    } catch (e) { toast(songError(e)); setBusy(false) }
  }
  const end = Math.min(decoded.duration, start + CLIP_SEC)
  return <div className="song-sheet">
    <h3>{t('Your workout song')}</h3>
    <p className="small muted">{t('{0} seconds of it play with your post.', CLIP_SEC)}</p>
    <label className="song-l" htmlFor="song-title">{t('Title')}</label>
    <input id="song-title" className="input" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder={t('Song and artist')} />
    <label className="song-l" htmlFor="song-start">{t('Clip from {0} to {1}', clock(start), clock(end))}</label>
    <input id="song-start" type="range" className="song-range" min={0} max={max} step={1} value={start} disabled={max === 0}
      onChange={e => { stop(); setStart(Number(e.target.value)) }} />
    <div className="song-ends small muted"><span>0:00</span><span>{clock(decoded.duration)}</span></div>
    <div className="song-a">
      <Button icon={listening ? 'pause' : 'play'} onClick={listen}>{listening ? t('Stop') : t('Listen')}</Button>
      <Button variant="primary" icon="check" disabled={busy} onClick={use}>{busy ? t('Uploading…') : t('Use this song')}</Button>
    </div>
  </div>
}

/**
 * "Add a song", or the chosen one with a button to take it off. `value` is { id, title } or null;
 * `onChange(next)` gets the new song (null when taken off).
 */
export function SongField({ value, onChange, disabled }) {
  const input = useRef(null)
  const [reading, setReading] = useState(false)
  const pick = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { toast(t('A song needs a connection. Add it once you are back online.')); return }
    setReading(true)
    try {
      const decoded = await decodeSong(file)
      useUI.getState().openSheet(close => <SongSheet file={file} decoded={decoded} close={close} onPicked={onChange} />)
    } catch (err) { toast(songError(err)) } finally { setReading(false) }
  }
  return <>
    <input ref={input} type="file" accept="audio/*" style={{ display: 'none' }} onChange={pick} data-testid="song-file" />
    {value?.id
      ? <div className="song-chosen">
        <SongBar song={value} />
        <button className="iconbtn sm" onClick={() => onChange(null)} aria-label={t('Remove song')}><Icon name="xmark" /></button>
      </div>
      : <Button size="sm" icon="music" disabled={disabled || reading} onClick={() => input.current?.click()}>{reading ? t('Reading the song…') : t('Add a song')}</Button>}
  </>
}
