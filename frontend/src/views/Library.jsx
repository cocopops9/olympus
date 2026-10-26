import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { EXDB, BODYPARTS, allExercises, equipmentOf, byCategory, searchExercises, similarExercises } from '../lib/exercises.js'
import EquipChips from '../components/EquipChips.jsx'
import { equipFamilies, liveEquip, matchesEquip } from '../lib/equipment-groups.js'
import { MUSCLE_NAME } from '../lib/muscles.js'
import { activeProfile, exAvailable } from '../lib/equipment.js'
import { bestWeightFor } from '../lib/history.js'
import { fmtNum, exCount } from '../lib/format.js'
import { t, tn, exerciseNameFor, exerciseNameClass } from '../lib/i18n.js'
import { Thumb } from '../components/Media.jsx'
import { exerciseDetailSheet, addToRoutineSheet, customExSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import ExerciseViewToggle from '../components/ExerciseViewToggle.jsx'
import ExerciseGuide from '../components/ExerciseGuide.jsx'
import { POPULAR } from '../lib/exercise-guide.js'
import { useUI } from '../store/useUI.js'
import { Button } from '../components/ui.jsx'
import { tappable, useRevealActiveChip } from '../lib/use-sheet-keyboard.js'
import { useAutoMore } from '../lib/use-auto-more.js'
import { isFav, sortFavouritesFirst, sortYoursFirst, usageOf } from '../lib/favourites.js'

// The library opens on the body (components/ExerciseGuide.jsx), as the exercise picker does: a
// tap on a muscle, or on full body, cardio, stretching, lists what fits, the well-known movements
// first. "Search by name" opens the whole list below, with its filters.
export default function Library({ start = 'guide' }) {
  const [mode, setMode] = useState(start)
  if (mode === 'guide') return <>
    <div className="hdr lib-hdr"><div><h1>{t('Exercises')}</h1></div></div>
    <ExerciseGuide title={false}
      onPick={(e, quick) => (quick ? addToRoutineSheet(e) : exerciseDetailSheet(e))}
      onSearch={() => setMode('search')}
      onCreate={() => customExSheet(null, ex => exerciseDetailSheet(ex))} />
  </>
  return <LibrarySearch onBody={() => setMode('guide')} />
}

const TYPE_LABEL = x => t(x)

function LibrarySearch({ onBody }) {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [q, setQ] = useState('')
  const [bp, setBp] = useState('')
  const [eq, setEq] = useState('')
  const [cat, setCat] = useState('')
  const [showAll, setShowAll] = useState(false)   // ignore the active equipment profile for this session
  const [shown, setShown] = useState(40)
  const bpStrip = useRef(null), eqStrip = useRef(null), catStrip = useRef(null)
  const searchRef = useRef(null)
  // Opened from "Search by name": the keyboard comes up at once.
  useEffect(() => { searchRef.current?.focus() }, [])
  const moreRef = useAutoMore(() => setShown(s => s + 40))
  const profile = activeProfile(S)
  // Your own exercises, counted the way the list below shows them (allExercises puts every
  // custom entry in front of the catalogue; deleting one removes it from customEx outright).
  const ownCount = (S.customEx || []).filter(c => c && c.id).length
  const inPart = searchExercises(allExercises(S).filter(e => !bp || e.bp === bp), q)
  // Kind of exercise (strength, stretching, cardio...), the same fallback as equipment below: a
  // choice the search or body part has narrowed away is ignored for now, never a dead end.
  const { opts: catOpts, on: catOn, list: base } = byCategory(inPart, cat)
  const eqFiltered = (profile && !showAll) ? base.filter(e => exAvailable(S, e)) : base
  const eqOpts = equipFamilies(eqFiltered)
  // Drop the equipment filter if the search narrowed it away, so you never hit a dead end.
  const eqOn = liveEquip(eqOpts, eq)
  // Favourites float to the top of whatever the filters left (issue #6), the rest keeps its order;
  // while searching, the exercises you have logged or planned follow right after them.
  const narrowedList = eqOn ? eqFiltered.filter(e => matchesEquip(e, eqOn)) : eqFiltered
  const usage = useMemo(() => (q.trim() ? usageOf(S) : null), [q, S.routines, S.workouts])
  // Without a search, the well-known movements lead (lib/exercise-guide.js POPULAR), after your
  // favourites: an alphabetical list of 5,600 starts with drills nobody looks for.
  const f = usage ? sortYoursFirst(narrowedList, S, usage)
    : [...sortFavouritesFirst(narrowedList, S)].sort((a, b) => (isFav(S, b.id) - isFav(S, a.id)) || (POPULAR.has(b.id) - POPULAR.has(a.id)))
  useRevealActiveChip(bpStrip, bp)
  useRevealActiveChip(eqStrip, eqOn)
  // A live count at the end of the search field while a search or filter narrows the list
  // (idea and first version: GitLab !31) — how many are left, before scrolling to find out.
  const narrowed = !!(q.trim() || bp || eqOn || catOn)
  // Close but not exact (a typo too many, most of the words, a similar name), under the results
  // once they are all on screen, so a search almost never ends on "No match".
  // Worked out a beat behind the typing (useDeferredValue): the list itself never waits for it.
  const qLate = useDeferredValue(q)
  const similar = q.trim() && qLate === q && f.length <= shown
    ? similarExercises(allExercises(S).filter(e => (!bp || e.bp === bp) && (!profile || showAll || exAvailable(S, e))), q, f, f.length ? 12 : 30)
    : []
  const row = e => {
    const best = bestWeightFor(S, e.id)
    return <div key={e.id} className="item" {...tappable(() => exerciseDetailSheet(e))}>
      <Thumb ex={e} />
      <div className="grow"><div className={`tt ${exerciseNameClass(e)}`}>{isFav(S, e.id) && <Icon name="starFill" className="fav-star" />}{exerciseNameFor(e)}</div><div className="ss capitalize">{t(MUSCLE_NAME[e.tg] || e.tg || e.bp)} · {t(e.eq)}</div></div>
      {best > 0 && <span className="tag acc">{fmtNum(best)}</span>}
      <button className="eg-add" aria-label={t('Plan')} onClick={ev => { ev.stopPropagation(); addToRoutineSheet(e) }}><Icon name="plus" /></button>
    </div>
  }

  return <>
    <div className="hdr lib-hdr"><div className="row" style={{ gap: 6, alignItems: 'center' }}>
      <button className="iconbtn" onClick={onBody} aria-label={t('Back')}><Icon name="chevronLeft" /></button><h1>{t('Exercises')}</h1></div>
      <Button size="sm" variant="tinted" icon="figureStrength" onClick={onBody}>{t('By muscle')}</Button>
      <div className="sub lib-count">{ownCount
        ? tn('{1} animated exercises + 1 of your own', '{1} animated exercises + {0} of your own', ownCount, EXDB.length)
        : t('{0} exercises with animations', EXDB.length)}</div>
    </div>
    <div className="search-row" style={{ marginBottom: 10 }}><div className={'search' + (narrowed ? ' has-count' : '') + (q ? ' has-clear' : '')}><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      <input ref={searchRef} className="input" placeholder={t('Search…')} value={q} onChange={e => { setQ(e.target.value); setShown(40) }} />
      {narrowed && <span className="search-count" role="status" aria-label={exCount(f.length)}>{fmtNum(f.length)}</span>}
      {q && <button className="clear" onClick={() => { setQ(''); setShown(40) }} aria-label={t('Clear')}><Icon name="xmark" /></button>}</div>
      <ExerciseViewToggle /></div>
    {profile && <div className="small dim row" style={{ margin: '-4px 2px 10px', gap: 6, alignItems: 'center' }}>
      <Icon name="kettlebell" style={{ fontSize: 13 }} />
      {showAll ? t('Showing all equipment') : t('Showing what you have in "{0}"', profile.name)}
      <button className="chip nocap" style={{ marginInlineStart: 'auto', padding: '3px 10px', fontSize: 12 }} onClick={() => setShowAll(v => !v)}>
        {showAll ? t('Filter by "{0}"', profile.name) : t('Show all equipment')}
      </button>
    </div>}
    {/* Changing body part keeps the equipment filter (issue #71): the eqOn fallback above drops
        it only for the current view if the new body part has nothing under it, without forgetting
        the choice. "All" clears it, since it spans every body part. */}
    <div className="chips" ref={bpStrip} style={{ marginBottom: eqOpts.length > 1 || catOpts.length > 1 ? 8 : 12 }}>
      <button className={'chip nocap' + (!bp ? ' on' : '')} onClick={() => { setBp(''); setEq(''); setShown(40) }}>{t('All')}</button>
      {BODYPARTS.map(b => <button key={b} className={'chip' + (bp === b ? ' on' : '')} onClick={() => { setBp(b); setShown(40) }}>{t(b)}</button>)}
    </div>
    <EquipChips list={eqFiltered} value={eqOn} onChange={v => { setEq(v); setShown(40) }} stripRef={eqStrip} style={{ marginBottom: 12 }}
      lead={catOpts.length > 1 && <button className={'chip eq-fam' + (catOn ? ' on' : '')} onClick={() => typeMenu(catOpts, catOn, v => { setCat(v); setShown(40) })}>
        <span className="capitalize">{catOn ? TYPE_LABEL(catOn) : t('Any type')}</span><span className="eq-more"><Icon name="chevronDown" /></span>
      </button>} />
    <div className={'list' + (S.exerciseView === 'cards' ? ' ex-grid' : '')}>
      <div className="item ex-new" {...tappable(() => customExSheet(null, ex => exerciseDetailSheet(ex), q.trim()))}>
        <div className="thumb thumb-x"><Icon name="plusCircle" /></div>
        <div className="grow"><div className="tt">{t('Create your own exercise')}</div><div className="ss">{t('name + body part, and a photo or video if you like')}</div></div><Icon name="plus" className="chev" />
      </div>
      {f.slice(0, shown).map(row)}
      {f.length === 0 && !similar.length && <div className="empty"><div className="ico"><Icon name="magnifier" /></div>{t('No match')}</div>}
      {similar.length > 0 && <h4 className="sec similar-label">{f.length ? t('Similar exercises') : t('No exact match. These come close:')}</h4>}
      {similar.map(row)}
    </div>
    {f.length > shown && <><div style={{ height: 10 }} /><Button ref={moreRef} onClick={() => setShown(s => s + 40)}>{t('Show more')}</Button></>}
  </>
}


// The kinds of exercise, as one chip that opens this list instead of a row of its own.
function typeMenu(opts, on, pick) {
  useUI.getState().openSheet(close => <>
    <h3 style={{ marginBottom: 10 }}>{t('Type of exercise')}</h3>
    <div className="list menu-list">
      {['', ...opts].map(x => <div key={x || 'any'} className="item menu-item" {...tappable(() => { close(); pick(x) })}>
        <div className="grow"><div className="tt capitalize">{x ? TYPE_LABEL(x) : t('Any type')}</div></div>
        <span className={'menu-on' + (on === x ? ' is-on' : '')}><Icon name="check" /></span>
      </div>)}
    </div>
  </>)
}
