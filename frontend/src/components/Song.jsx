// Olympus: the song of a post. "Add a song" opens the music catalogue (lib/music.js: the songs
// most played now in the person's country, and a search), each with its 30-second preview; a tap
// on the cover listens, a tap on the song picks it. A song from the phone is the other way in
// (lib/song.js): its clip is cut on the phone and uploaded. On a post, the song is a bar with its cover, title and artist and a
// play button; one song plays at a time, its 30 seconds only.
import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { photoBlob } from '../lib/social.js'
import { decodeSong, clipStartMax, defaultStart, clipBlob, uploadSong, titleFromFile, CLIP_SEC } from '../lib/song.js'
import { topSongs, searchSongs, songOf, onlineSource, musicCountry } from '../lib/music.js'
import { SearchField } from './ui.jsx'
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
        // A song of the catalogue plays its preview from Apple; posts made before with the
        // earlier catalogue (Audius) still play their 30 seconds from there.
        const legacy = song.src === 'audius'
        const online = onlineSource(song) || (legacy ? `https://api.audius.co/v1/tracks/${encodeURIComponent(song.id)}/stream?app_name=Olympus` : null)
        if (!online) url.current = URL.createObjectURL(await photoBlob(song.id))
        const a = new Audio(online || url.current)
        const from = legacy ? Math.max(0, Number(song.start) || 0) : 0
        a.onplay = () => setState('playing')
        a.onpause = a.onended = () => { setState('idle'); if (playing === a) playing = null }
        if (legacy) {
          a.ontimeupdate = () => { if (a.currentTime >= from + 30) { a.pause(); a.currentTime = from } }
          a.preload = 'auto'; a.currentTime = from
          a.addEventListener('loadedmetadata', () => { if (a.currentTime < from) a.currentTime = from }, { once: true })
        }
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
    {song.art && <img className="song-art" src={song.art} alt="" />}
    <span className="song-t"><Icon name="music" /><span className="song-tt">{song.title || t('Song')}{song.artist && <small>{song.artist}</small>}</span></span>
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
 * The music catalogue (lib/music.js): the chart of the person's country, or a search; a tap on a
 * cover plays the preview, a tap on a song picks it. At the bottom, a song from the phone instead.
 */
function MusicSheet({ close, onPicked, fromPhone }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState(null)
  const [failed, setFailed] = useState(false)
  const [preview, setPreview] = useState(null)   // id of the song playing
  const [tries, setTries] = useState(0)
  const a = useRef(null)
  const country = musicCountry()
  useEffect(() => () => { a.current?.pause() }, [])
  useEffect(() => {
    let live = true
    setList(null); setFailed(false)
    const timer = setTimeout(() => {
      const ask = q.trim() ? searchSongs(q.trim(), country) : topSongs(country)
      ask.then(l => { if (live) setList(l) }, () => { if (live) { setFailed(true); setList([]) } })
    }, q.trim() ? 350 : 0)
    return () => { live = false; clearTimeout(timer) }
  }, [q, country, tries])
  const play = tr => {
    if (preview === tr.id) { a.current?.pause(); setPreview(null); return }
    a.current?.pause()
    const au = new Audio(tr.preview)
    au.onended = () => setPreview(null)
    a.current = au
    setPreview(tr.id)
    au.play().catch(() => { setPreview(null); toast(t('This song cannot be played right now.')) })
  }
  const pick = tr => { a.current?.pause(); setPreview(null); onPicked(songOf(tr)); close() }
  let regionName = country.toUpperCase()
  try { regionName = new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' }).of(country.toUpperCase()) || regionName } catch { /* old WebView */ }
  return <div className="mus">
    <h3>{t('Add a song')}</h3>
    <SearchField value={q} placeholder={t('Search songs and artists')} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} />
    {!q.trim() && <div className="mus-head"><Icon name="flame" /><b>{t('Top songs')}</b><small className="muted">{regionName}</small></div>}
    <div className="mus-list">
      {list === null ? <div className="empty small">{t('Loading…')}</div>
        : failed ? <div className="empty small">{t('The music catalogue could not be reached. Try again, or pick a song from your phone.')}
          <div><button className="btn ghost sm" onClick={() => setTries(n => n + 1)}>{t('Try again')}</button></div></div>
          : !list.length ? <div className="empty small">{t('No songs found.')}</div>
            : list.map((tr, i) => <div key={tr.id} className="mus-row">
              {!q.trim() && <span className="mus-rank">{i + 1}</span>}
              <button className={'mus-art' + (preview === tr.id ? ' on' : '')} onClick={() => play(tr)} aria-label={(preview === tr.id ? t('Stop') : t('Listen')) + ': ' + tr.title}>
                {tr.art && <img src={tr.art} alt="" loading="lazy" />}<span className="mus-pp"><Icon name={preview === tr.id ? 'pause' : 'play'} /></span>
              </button>
              <button className="mus-m" onClick={() => pick(tr)}>
                <b>{tr.title}{tr.explicit && <span className="mus-e" title={t('Explicit')}>E</span>}</b><small>{tr.artist}</small>
              </button>
              <button className="iconbtn sm" onClick={() => pick(tr)} aria-label={t('Use this song')}><Icon name="plus" /></button>
            </div>)}
    </div>
    <button className="btn ghost mus-phone" onClick={() => { a.current?.pause(); close(); fromPhone() }}><Icon name="music" />{t('A song from your phone')}</button>
    <p className="small muted mus-credit">{t('Charts and 30-second previews from Apple Music.')}</p>
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
      : <Button size="sm" icon="music" disabled={disabled || reading}
        onClick={() => useUI.getState().openSheet(close => <MusicSheet close={close} onPicked={onChange} fromPhone={() => input.current?.click()} />)}>
        {reading ? t('Reading the song…') : t('Add a song')}</Button>}
  </>
}
