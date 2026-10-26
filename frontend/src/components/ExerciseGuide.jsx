// Olympus: the body-first way to add an exercise, the picker's first screen.
//
// Step one asks what you want to train: tap a muscle on the body (front and back side by side),
// or one of the tiles under it for full body, cardio, stretching or other training. Step two
// lists what fits that choice, yours first, then the well-known movements, with everything else
// one "Show more" away (lib/exercise-guide.js decides the order). A search bar at the top opens
// the full search list for anyone who knows the name already (onSearch).
//
// Rows behave as in the search list: a tap opens the exercise's sets and reps before adding it,
// the + adds it at once with the default sets (onPick(ex) and onPick(ex, true)).
import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { allExercises, BODYPARTS, searchExercises } from '../lib/exercises.js'
import { activeProfile, exAvailable } from '../lib/equipment.js'
import { MUSCLES, MUSCLE_NAME } from '../lib/muscles.js'
import { t, tn, exerciseNameFor, exerciseNameClass } from '../lib/i18n.js'
import { GROUPS, STAPLES, exercisesFor, arrange, countsFor } from '../lib/exercise-guide.js'
import { isFav } from '../lib/favourites.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { useAutoMore } from '../lib/use-auto-more.js'
import BodyMap from './BodyMap.jsx'
import EquipChips from './EquipChips.jsx'
import { equipFamilies, liveEquip, matchesEquip } from '../lib/equipment-groups.js'
import { Thumb } from './Media.jsx'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import '../exercise-guide.css'

function usageOf(S) {
  const u = {}
  S.routines.forEach(r => r.ex.forEach(e => { u[e.id] = (u[e.id] || 0) + 1 }))
  S.workouts.forEach(w => w.entries.forEach(e => { u[e.id] = (u[e.id] || 0) + 1 }))
  return u
}

const labelOf = target => (target.kind === 'muscle' ? t(MUSCLE_NAME[target.id])
  : target.kind === 'mine' ? t('My exercises')
    : t(GROUPS.find(g => g.id === target.id)?.label || ''))

function ExRow({ e, S, onPick }) {
  const name = exerciseNameFor(e)
  return <div className="item eg-row" {...tappable(() => onPick(e))}>
    <Thumb ex={e} />
    <div className="grow">
      <div className={`tt ${exerciseNameClass(e)}`}>{isFav(S, e.id) && <Icon name="starFill" className="fav-star" />}{name}</div>
      <div className="ss capitalize">{t(e.eq)}</div>
    </div>
    <button className="eg-add" aria-label={t('Add “{0}”', name)} onClick={ev => { ev.stopPropagation(); onPick(e, true) }}><Icon name="plus" /></button>
  </div>
}

function Choice({ target, catalog, S, usage, onPick, onBack }) {
  const [filter, setFilter] = useState('')
  const [q, setQ] = useState('')
  const [more, setMore] = useState(0)
  const moreRef = useAutoMore(() => setMore(n => (n ? n + 30 : n)))
  const mine = useMemo(() => new Set([...Object.keys(usage), ...(S.favEx || [])]), [usage, S.favEx])
  const all = useMemo(() => exercisesFor(catalog, target, mine), [catalog, target, mine])
  // Stretches are told apart by where they stretch; everything else by what you need for it.
  const byPart = target.kind === 'group' && target.id === 'stretch'
  // Stretches by where they stretch; everything else by equipment family (lib/equipment-groups.js).
  const opts = byPart ? BODYPARTS.filter(b => b !== 'cardio' && all.some(e => e.bp === b)) : []
  const on = byPart ? (opts.includes(filter) ? filter : '') : liveEquip(equipFamilies(all), filter)
  const narrowed = on ? all.filter(e => (byPart ? e.bp === on : matchesEquip(e, on))) : all
  // A search keeps the order below (yours, then popular, then the rest): it only leaves out what
  // does not match, and the rest opens on its own, since that is where a typed name often is.
  const searching = q.trim() !== ''
  const list = useMemo(() => (searching ? searchExercises(narrowed, q) : narrowed), [narrowed, q, searching])
  const tiers = useMemo(() => arrange(list, {
    usage, favs: new Set(S.favEx || []), nameOf: exerciseNameFor,
    staples: target.kind === 'mine' ? [] : STAPLES[target.id] || [],
  }), [list, usage, S.favEx, target])
  const shownMore = tiers.more.slice(0, searching ? Math.max(more, 30) : more)

  return <>
    <div className="eg-top">
      <button className="iconbtn" onClick={onBack} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div className="grow">
        <h3 className="capitalize" style={{ margin: 0 }}>{labelOf(target)}</h3>
        <div className="small muted">{tn('{0} exercise', '{0} exercises', list.length)}</div>
      </div>
    </div>
    <div className={'search eg-find' + (q ? ' has-clear' : '')}><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      <input className="input" placeholder={t('Search in {0}…', labelOf(target))} value={q} onChange={e => { setQ(e.target.value); setMore(0) }} />
      {q && <button className="clear" onClick={() => setQ('')} aria-label={t('Clear')}><Icon name="xmark" /></button>}
    </div>
    {!byPart && <EquipChips className="eg-filter" list={all} value={on} onChange={v => { setFilter(v); setMore(0) }} />}
    {opts.length > 1 && <div className="chips eg-filter">
      <button className={'chip nocap' + (!on ? ' on' : '')} onClick={() => { setFilter(''); setMore(0) }}>{t('All')}</button>
      {opts.map(x => <button key={x} className={'chip' + (on === x ? ' on' : '')} onClick={() => { setFilter(x); setMore(0) }}>{t(x)}</button>)}
    </div>}
    {tiers.yours.length > 0 && <>
      <h4 className="sec eg-sec"><Icon name="starFill" />{t('Your favourites')}</h4>
      <div className="list">{tiers.yours.map(e => <ExRow key={e.id} e={e} S={S} onPick={onPick} />)}</div>
    </>}
    {tiers.popular.length > 0 && <>
      <h4 className="sec eg-sec"><Icon name="flame" />{t('Most popular')}</h4>
      <div className="list">{tiers.popular.map(e => <ExRow key={e.id} e={e} S={S} onPick={onPick} />)}</div>
    </>}
    {shownMore.length > 0 && <>
      <h4 className="sec eg-sec">{t('More exercises')}</h4>
      <div className="list">{shownMore.map(e => <ExRow key={e.id} e={e} S={S} onPick={onPick} />)}</div>
    </>}
    {list.length === 0 && <div className="empty"><div className="ico"><Icon name="magnifier" /></div>{t('No match')}</div>}
    {tiers.more.length > shownMore.length && <>
      <div style={{ height: 10 }} />
      <Button ref={more ? moreRef : undefined} onClick={() => setMore(n => n + 30)}>
        {more ? t('Show more') : tn('Show {0} more exercise', 'Show {0} more exercises', tiers.more.length)}
      </Button>
    </>}
  </>
}

export default function ExerciseGuide({ onPick, title, onSearch, onCreate, start = null }) {
  const S = useStore(s => s.S)
  const [target, setTarget] = useState(start)
  const [pressed, setPressed] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const usage = useMemo(() => usageOf(S), [S.routines, S.workouts])
  const profile = activeProfile(S)
  const catalog = useMemo(() => {
    const all = allExercises(S)
    return profile && !showAll ? all.filter(e => exAvailable(S, e)) : all
  }, [S.customEx, S.equipFilterOn, S.activeEquipId, S.equipProfiles, showAll])
  const counts = useMemo(() => countsFor(catalog, MUSCLES), [catalog])
  const mineCount = useMemo(() => new Set([...Object.keys(usage), ...(S.favEx || [])]).size, [usage, S.favEx])

  // The tapped muscle lights up for a moment before its list opens, so the tap reads as a press.
  const tapMuscle = m => {
    if (!counts[m]) return
    setPressed(m)
    setTimeout(() => { setTarget({ kind: 'muscle', id: m }); setPressed(null) }, 170)
  }

  const equipLine = profile && <div className="small dim row eg-equip">
    <Icon name="kettlebell" style={{ fontSize: 13 }} />
    {showAll ? t('Showing all equipment') : t('Showing what you have in "{0}"', profile.name)}
    <button className="chip nocap" onClick={() => setShowAll(v => !v)}>
      {showAll ? t('Filter by "{0}"', profile.name) : t('Show all equipment')}
    </button>
  </div>

  if (target) return <>
    {equipLine}
    <Choice target={target} catalog={catalog} S={S} usage={usage} onPick={onPick} onBack={() => setTarget(null)} />
  </>

  return <>
    {title !== false && <h3 style={{ marginBottom: 10 }}>{title || t('Add exercise')}</h3>}
    <button className="eg-search" onClick={onSearch}>
      <Icon name="magnifier" /><span>{t('Search by name')}</span>
    </button>
    {equipLine}
    <div className="eg-body">
      <div className="eg-hint"><Icon name="target" />{t('Tap the muscle you want to train')}</div>
      <BodyMap className="tappable eg-map" body={S.body} selected={pressed} onMuscle={tapMuscle} />
      <div className="eg-sides" aria-hidden="true"><span>{t('Front')}</span><span>{t('Back side')}</span></div>
    </div>
    <div className="eg-tiles">
      {GROUPS.map(g => <button key={g.id} className="eg-tile" style={{ '--tint': g.tint }} disabled={!counts[g.id]}
        onClick={() => setTarget({ kind: 'group', id: g.id })}>
        <span className="eg-ico"><Icon name={g.icon} /></span>
        <span className="eg-tl">{t(g.label)}</span>
        <span className="eg-ts">{t(g.sub)}</span>
      </button>)}
    </div>
    {mineCount > 0 && <button className="eg-mine" onClick={() => setTarget({ kind: 'mine' })}>
      <Icon name="starFill" /><span className="grow">{t('My exercises')}</span><span className="dim">{mineCount}</span><Icon name="chevronRight" />
    </button>}
    <button className="eg-mine" onClick={onCreate}>
      <Icon name="plusCircle" /><span className="grow">{t('Create your own exercise')}</span><Icon name="chevronRight" />
    </button>
  </>
}
