// Olympus: choosing the exercise in Stats, Exercise progress. The selected one is a card with
// its picture, name and best; the sheet lists the ones trained recently first, then every other
// exercise you have trained grouped by body part, each with its picture, its name (the English
// one underneath when the language shows both), its best and when it was last done.
import { useMemo, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { EXIDX, matchExercise, isCustomEx } from '../lib/exercises.js'
import { musclesOf, MUSCLES, MUSCLE_NAME } from '../lib/muscles.js'
import { useStore } from '../store/useStore.js'
import BodyMap from './BodyMap.jsx'
import { fmtAgo } from '../lib/format.js'
import { Thumb } from './Media.jsx'
import Icon from './Icon.jsx'
import '../progress-picker.css'

const RECENT = 5
const capFirst = s => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s)

/** "Calf press alla macchina (Lever Calf Press)" → ["Calf press alla macchina", "Lever Calf Press"]. */
export function splitName(text) {
  const m = /^(.*\S)\s+\(([^()]+)\)$/.exec(String(text || ''))
  return m ? [m[1], m[2]] : [String(text || ''), '']
}

/**
 * `items`: [{ id, name, best, last, match }] (best a text like "154 kg", last a timestamp,
 * match the exercise for the search). Groups: recent first, then by body part.
 */
export function groupProgressItems(items, query = '', matchFn = null) {
  const q = query.trim()
  if (q) return [{ key: 'found', title: null, items: items.filter(i => (matchFn ? matchFn(i, q) : i.name.toLowerCase().includes(q.toLowerCase()))) }]
  const byLast = [...items].sort((a, b) => (b.last || 0) - (a.last || 0))
  const recent = byLast.slice(0, RECENT)
  const rest = byLast.slice(RECENT)
  const groups = new Map()
  for (const i of rest) {
    const bp = EXIDX[i.id]?.bp || 'other'
    if (!groups.has(bp)) groups.set(bp, [])
    groups.get(bp).push(i)
  }
  return [
    { key: 'recent', title: t('Trained recently'), items: recent },
    ...[...groups.entries()].sort((a, b) => b[1].length - a[1].length)
      .map(([bp, list]) => ({ key: bp, title: capFirst(t(bp === 'other' ? 'Other' : bp)), items: list.sort((a, b) => a.name.localeCompare(b.name)) })),
  ].filter(g => g.items.length)
}

// The English name under the translated one, for catalogue exercises only: a name of your own
// like "Bicep curl (cable)" keeps its brackets.
const nameParts = item => (EXIDX[item.id] && !isCustomEx(EXIDX[item.id]) ? splitName(item.name) : [item.name, ''])

function Row({ item, on, pick }) {
  const ex = EXIDX[item.id]
  const [main, en] = nameParts(item)
  return <button className={'pp-row' + (on ? ' on' : '')} onClick={() => pick(item.id)}>
    {ex ? <Thumb ex={ex} /> : <div className="thumb thumb-x"><Icon name="dumbbell" /></div>}
    <span className="pp-txt">
      <span className="pp-name">{main}</span>
      {en && <span className="pp-en">{en}</span>}
      {item.last ? <span className="pp-when">{fmtAgo(item.last)}</span> : null}
    </span>
    {item.best && <span className="pp-best">{item.best}</span>}
  </button>
}

/** The muscle an exercise trains most (lib/muscles.js), or null. */
export function primaryMuscle(id) {
  const ex = EXIDX[id]
  if (!ex) return null
  const w = Object.entries(musclesOf(ex)).filter(([m]) => MUSCLES.includes(m)).sort((a, b) => b[1] - a[1])
  return w[0]?.[0] || null
}

function Sheet({ items, value, onChange, close, matcherOf }) {
  const body = useStore(s => s.S.body)
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState(() => primaryMuscle(value))
  const match = (i, query) => matchExercise(matcherOf ? matcherOf(i.id) : (EXIDX[i.id] || { n: i.name }), query)
  const groups = useMemo(() => groupProgressItems(items, q, match), [items, q])
  const pick = id => { onChange(id); close() }
  // The map: each muscle shaded by how many trained exercises have it as their main one.
  const byMuscle = useMemo(() => {
    const out = {}
    for (const i of items) { const m = primaryMuscle(i.id); if (m) (out[m] = out[m] || []).push(i) }
    for (const m of Object.keys(out)) out[m].sort((a, b) => (b.last || 0) - (a.last || 0))
    return out
  }, [items])
  const load = Object.fromEntries(Object.entries(byMuscle).map(([m, l]) => [m, l.length]))
  const searching = !!q.trim()
  const recent = groups.find(g => g.key === 'recent')
  const rest = groups.filter(g => g.key !== 'recent')
  return <div className="pp">
    <h3 style={{ marginBottom: 10 }}>{t('Exercise progress')}</h3>
    <label className="pp-search">
      <Icon name="magnifier" />
      <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder={t('Search…')} aria-label={t('Search…')} />
    </label>
    {searching
      ? <>
        {groups[0]?.items.length ? <div className="pp-list" style={{ marginTop: 10 }}>{groups[0].items.map(i => <Row key={i.id} item={i} on={i.id === value} pick={pick} />)}</div>
          : <div className="muted small" style={{ textAlign: 'center', padding: 20 }}>{t('No match')}</div>}
      </>
      : <>
        {recent && <section className="pp-sec">
          <h4 className="pp-h">{recent.title} <span className="dim">{recent.items.length}</span></h4>
          <div className="pp-list">{recent.items.map(i => <Row key={i.id} item={i} on={i.id === value} pick={pick} />)}</div>
        </section>}
        <section className="pp-sec">
          <h4 className="pp-h">{t('By muscle')}</h4>
          <div className="pp-map">
            <BodyMap className="tappable" load={load} body={body} selected={muscle} onMuscle={m => setMuscle(cur => (cur === m ? null : m))} />
          </div>
          {muscle
            ? <>
              <h4 className="pp-h">{t(MUSCLE_NAME[muscle])} <span className="dim">{(byMuscle[muscle] || []).length}</span></h4>
              {(byMuscle[muscle] || []).length
                ? <div className="pp-list">{byMuscle[muscle].map(i => <Row key={i.id} item={i} on={i.id === value} pick={pick} />)}</div>
                : <div className="muted small" style={{ textAlign: 'center', padding: 12 }}>{t('No exercise trained for this muscle yet.')}</div>}
            </>
            : <div className="muted small" style={{ textAlign: 'center', padding: '4px 0 8px' }}>{t('Tap a muscle to see its exercises.')}</div>}
        </section>
        {rest.length > 0 && <details className="pp-all">
          <summary>{t('All exercises, by body part')}</summary>
          {rest.map(g => <section key={g.key} className="pp-sec">
            <h4 className="pp-h">{g.title} <span className="dim">{g.items.length}</span></h4>
            <div className="pp-list">{g.items.map(i => <Row key={i.id} item={i} on={i.id === value} pick={pick} />)}</div>
          </section>)}
        </details>}
      </>}
  </div>
}

/** The selected exercise as a card; tapping it opens the picker. */
export default function ProgressPicker({ items, value, onChange, matcherOf }) {
  const cur = items.find(i => i.id === value)
  if (!cur) return null
  const ex = EXIDX[cur.id]
  const [main, en] = nameParts(cur)
  const open = () => useUI.getState().openSheet(close => <Sheet items={items} value={value} onChange={onChange} close={close} matcherOf={matcherOf} />)
  return <button className="pp-cur" onClick={open} aria-label={t('Exercise') + ': ' + main}>
    {ex ? <Thumb ex={ex} /> : <div className="thumb thumb-x"><Icon name="dumbbell" /></div>}
    <span className="pp-txt">
      <span className="pp-name">{main}</span>
      {en && <span className="pp-en">{en}</span>}
      <span className="pp-when">{tn('{0} exercise trained', '{0} exercises trained', items.length)}</span>
    </span>
    {cur.best && <span className="pp-best">{cur.best}</span>}
    <Icon name="chevronsUpDown" className="pp-chev" />
  </button>
}

