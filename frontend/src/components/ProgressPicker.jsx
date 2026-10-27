// Olympus: choosing the exercise in Stats, Exercise progress. The selected one is a card with
// its picture, name and best; the sheet lists the ones trained recently first, then every other
// exercise you have trained grouped by body part, each with its picture, its name (the English
// one underneath when the language shows both), its best and when it was last done.
import { useMemo, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { EXIDX, matchExercise } from '../lib/exercises.js'
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

function Row({ item, on, pick }) {
  const ex = EXIDX[item.id]
  const [main, en] = splitName(item.name)
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

function Sheet({ items, value, onChange, close, matcherOf }) {
  const [q, setQ] = useState('')
  const match = (i, query) => matchExercise(matcherOf ? matcherOf(i.id) : (EXIDX[i.id] || { n: i.name }), query)
  const groups = useMemo(() => groupProgressItems(items, q, match), [items, q])
  const pick = id => { onChange(id); close() }
  return <div className="pp">
    <h3 style={{ marginBottom: 10 }}>{t('Exercise progress')}</h3>
    <label className="pp-search">
      <Icon name="magnifier" />
      <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder={t('Search…')} aria-label={t('Search…')} />
    </label>
    {groups.map(g => <section key={g.key} className="pp-sec">
      {g.title && <h4 className="pp-h">{g.title} <span className="dim">{g.items.length}</span></h4>}
      <div className="pp-list">{g.items.map(i => <Row key={i.id} item={i} on={i.id === value} pick={pick} />)}</div>
    </section>)}
    {!groups.length || (groups.length === 1 && !groups[0].items.length) ? <div className="muted small" style={{ textAlign: 'center', padding: 20 }}>{t('No match')}</div> : null}
  </div>
}

/** The selected exercise as a card; tapping it opens the picker. */
export default function ProgressPicker({ items, value, onChange, matcherOf }) {
  const cur = items.find(i => i.id === value)
  if (!cur) return null
  const ex = EXIDX[cur.id]
  const [main, en] = splitName(cur.name)
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

