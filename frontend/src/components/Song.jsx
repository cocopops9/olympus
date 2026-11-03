// Olympus: the song of a post. "Add a song" opens the music catalogue (lib/music.js: the songs
// most played now in the person's country, and a search), each with its 30-second preview; a tap
// on the cover listens, a tap on the song picks it, and a sheet then lets the person choose which
// part of the preview to share. A song from the phone is the other way in (lib/song.js): the
// person chooses any part of it, up to the whole song, and the clip is cut, encoded and uploaded
// on the phone. On a post, the song is a bar with its cover, title and artist and a play button;
// one song plays at a time, only the part that was chosen.
import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { photoBlob } from '../lib/social.js'
import { decodeSong, defaultRange, wholeRange, clampRange, previewRange, uploadSong, titleFromFile, MAX_SONG_SEC, MIN_CLIP_SEC } from '../lib/song.js'
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
        // The part of a catalogue song that was chosen: from `from` to `to` seconds.
        const from = legacy ? Math.max(0, Number(song.start) || 0) : Math.max(0, Number(song.from) || 0)
        const to = legacy ? from + 30 : Number(song.to) > from ? Number(song.to) : Infinity
        a.onplay = () => setState('playing')
        a.onpause = a.onended = () => { setState('idle'); if (playing === a) playing = null }
        if (from > 0 || to < Infinity) {
          a.ontimeupdate = () => { if (a.currentTime >= to) { a.pause(); a.currentTime = from } }
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

/**
 * Two handles on one bar: the start and the end of the part of a song to share. `max` is the
 * length of what can be chosen from, in seconds; `value` is { start, end }.
 */
function RangeTrim({ id, max, value, onChange, step = 1, disabled }) {
  const pct = x => (max > 0 ? Math.min(100, Math.max(0, x / max * 100)) : 0)
  const left = pct(value.start), width = pct(value.end) - left
  return <div className="trim">
    <div className="trim-track"><i style={{ left: left + '%', width: width + '%' }} /></div>
    <input id={id} type="range" className="trim-in" min={0} max={max} step={step} value={value.start} disabled={disabled || max === 0}
      aria-label={t('Start')} onChange={e => onChange(clampRange(max, { start: Number(e.target.value), end: value.end }, 'start'))} />
    <input type="range" className="trim-in" min={0} max={max} step={step} value={value.end} disabled={disabled || max === 0}
      aria-label={t('End')} onChange={e => onChange(clampRange(max, { start: value.start, end: Number(e.target.value) }, 'end'))} />
  </div>
}

/** What is chosen, in words: "Clip from 1:05 to 2:10" and how long it is. */
function RangeLabel({ range, id }) {
  return <label className="song-l" htmlFor={id}>
    {t('Clip from {0} to {1}', clock(range.start), clock(range.end))}
    <span className="song-len">{t('Length {0}', clock(range.end - range.start))}</span>
  </label>
}

export function SongSheet({ file, decoded, close, onPicked }) {
  const [title, setTitle] = useState(() => titleFromFile(file.name))
  const [range, setRange] = useState(() => defaultRange(decoded.duration))
  const [progress, setProgress] = useState(null)   // null, or 0..1 while the clip is prepared
  const [listening, setListening] = useState(false)
  const preview = useRef(null)
  const stop = () => { if (preview.current) { preview.current.stop(); preview.current = null } setListening(false) }
  useEffect(() => stop, [])
  const change = r => { stop(); setRange(r) }
  const listen = () => {
    if (listening) { stop(); return }
    const p = previewRange(decoded.buffer, range.start, range.end)
    preview.current = p
    setListening(true)
    p.done.then(() => { if (preview.current === p) { preview.current = null; setListening(false) } })
  }
  const use = async () => {
    stop(); setProgress(0)
    try {
      const id = await uploadSong(decoded.buffer, range.start, range.end, { onProgress: setProgress })
      onPicked({ id, title: title.trim().slice(0, 80) || titleFromFile(file.name) || t('Song') })
      close()
    } catch (e) { toast(songError(e)); setProgress(null) }
  }
  const busy = progress !== null
  const max = Math.floor(decoded.duration)
  return <div className="song-sheet">
    <h3>{t('Your workout song')}</h3>
    <p className="small muted">{t('Choose the part of the song to share, up to the whole song.')}</p>
    <label className="song-l" htmlFor="song-title">{t('Title')}</label>
    <input id="song-title" className="input" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder={t('Song and artist')} />
    <RangeLabel range={range} id="song-start" />
    <RangeTrim id="song-start" max={max} value={range} onChange={change} disabled={busy} />
    <div className="song-ends small muted"><span>0:00</span><span>{clock(decoded.duration)}</span></div>
    <div className="song-quick">
      <Button size="sm" disabled={busy} onClick={() => change(wholeRange(decoded.duration))}>{t('Whole song')}</Button>
      <Button size="sm" disabled={busy} onClick={() => change(clampRange(max, { start: range.start, end: Math.min(max, range.start + 30) }, 'end'))}>{t('{0} seconds', 30)}</Button>
    </div>
    {decoded.duration > MAX_SONG_SEC && <p className="small muted">{t('Up to {0} of a song can be shared.', clock(MAX_SONG_SEC))}</p>}
    <div className="song-a">
      <Button icon={listening ? 'pause' : 'play'} disabled={busy} onClick={listen}>{listening ? t('Stop') : t('Listen')}</Button>
      <Button variant="primary" icon="check" disabled={busy} onClick={use}>{busy ? t('Preparing the clip… {0}%', Math.round(progress * 100)) : t('Use this song')}</Button>
    </div>
  </div>
}

/**
 * A song of the catalogue, before it is picked: the preview is 30 seconds, and the person chooses
 * which part of it goes with the post (all of it to start with).
 */
export function TrimSheet({ track, close, onPicked }) {
  const [max, setMax] = useState(30)
  const [range, setRange] = useState({ start: 0, end: 30 })
  const [listening, setListening] = useState(false)
  const a = useRef(null)
  useEffect(() => {
    // The preview is "about" 30 seconds: its real length sets the end of the bar.
    const probe = new Audio(track.preview)
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => {
      const d = Math.min(30, Math.floor(probe.duration || 30))
      if (d >= MIN_CLIP_SEC) { setMax(d); setRange(r => clampRange(d, { start: r.start, end: Math.min(r.end, d) }, 'end')) }
    }
    return () => { probe.onloadedmetadata = null; a.current?.pause() }
  }, [track.preview])
  const stop = () => { a.current?.pause(); a.current = null; setListening(false) }
  const change = r => { stop(); setRange(r) }
  const listen = () => {
    if (listening) { stop(); return }
    const au = new Audio(track.preview)
    a.current = au
    au.currentTime = range.start
    au.addEventListener('loadedmetadata', () => { if (au.currentTime < range.start) au.currentTime = range.start }, { once: true })
    au.ontimeupdate = () => { if (au.currentTime >= range.end) stop() }
    au.onended = stop
    setListening(true)
    au.play().catch(() => { stop(); toast(t('This song cannot be played right now.')) })
  }
  const use = () => {
    stop()
    const whole = range.start === 0 && range.end >= max
    onPicked({ ...songOf(track), ...(whole ? {} : { from: Math.round(range.start), to: Math.round(range.end) }) })
    close()
  }
  return <div className="song-sheet">
    <h3>{t('Choose the part to share')}</h3>
    <div className="song-pick">
      {track.art && <img className="song-art lg" src={track.art} alt="" />}
      <span className="song-tt"><b>{track.title}</b><small>{track.artist}</small></span>
    </div>
    <p className="small muted">{t('A preview lasts 30 seconds: choose the part to share.')}</p>
    <RangeLabel range={range} id="trim-start" />
    <RangeTrim id="trim-start" max={max} value={range} onChange={change} />
    <div className="song-ends small muted"><span>0:00</span><span>{clock(max)}</span></div>
    <div className="song-a">
      <Button icon={listening ? 'pause' : 'play'} onClick={listen}>{listening ? t('Stop') : t('Listen')}</Button>
      <Button variant="primary" icon="check" onClick={use}>{t('Use this song')}</Button>
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
  // A tap on a song asks which part of its preview to share, then hands it over.
  const pick = tr => {
    a.current?.pause(); setPreview(null); close()
    useUI.getState().openSheet(done => <TrimSheet track={tr} close={done} onPicked={onPicked} />)
  }
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
