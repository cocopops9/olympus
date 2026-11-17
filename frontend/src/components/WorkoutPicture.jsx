// Olympus: the picture of a workout in the lists (the Profile's week, History): a photo kept with
// the workout, else a frame of its video, else the first photo of its post in the feed, else a frame
// of that post's video. With none of them, the routine's icon (`glyph`), or nothing when `bare`.
import { useEffect, useState } from 'react'
import { avatarUrl } from '../lib/social.js'
import { workoutMediaOf } from '../lib/media-refs.js'
import { useCover, isVideoCover } from '../lib/workout-cover.js'
import { useFrame } from '../lib/video-frame.js'
import { CustomThumb } from './CustomMedia.jsx'
import Icon from './Icon.jsx'

const Play = () => <span className="wrow-play" aria-hidden="true"><Icon name="playFill" /></span>

// A post's photo, small: the routine's icon until it has loaded, and if it cannot be.
function CoverThumb({ id, box, glyph, bare }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let live = true
    setUrl(null)
    avatarUrl(id).then(u => { if (live) setUrl(u) }, () => {})
    return () => { live = false }
  }, [id])
  return url ? <span className="lrow-i wrow-photo" style={box}><img src={url} alt="" /></span> : <Icon0 box={box} glyph={glyph} bare={bare} />
}

const Icon0 = ({ box, glyph, bare }) => (bare ? null
  : <span className="lrow-i" style={{ ...box, fontSize: Math.round(box.width * 0.56) }}><Icon name={glyph} /></span>)

function VideoCover({ id, box, glyph, bare }) {
  const frame = useFrame(id)
  return frame ? <span className="lrow-i wrow-photo wrow-video" style={box}><img src={frame} alt="" /><Play /></span> : <Icon0 box={box} glyph={glyph} bare={bare} />
}

export default function WorkoutPicture({ w, glyph = 'dumbbell', size = 34, radius = 8, bare = false }) {
  const box = { width: size, height: size, borderRadius: radius }
  const media = workoutMediaOf(w)
  const own = media.find(m => m && m.kind !== 'video') || media.find(m => m && m.kind === 'video' && m.poster)
  const cover = useCover(w.id)
  if (own) {
    const video = own.kind === 'video'
    return <span className={'lrow-i wrow-photo' + (video ? ' wrow-video' : '')} style={box}><CustomThumb ex={{ custom: true, media: own }} />{video && <Play />}</span>
  }
  if (isVideoCover(cover)) return <VideoCover id={cover.slice(1)} box={box} glyph={glyph} bare={bare} />
  if (cover) return <CoverThumb id={cover} box={box} glyph={glyph} bare={bare} />
  return <Icon0 box={box} glyph={glyph} bare={bare} />
}
