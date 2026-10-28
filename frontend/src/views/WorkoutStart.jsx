// Olympus: the Workout tab with no session running. One big "Start empty workout", then your
// routines as cards you can read at a glance: what each trains (a small body, the main muscles),
// what is in it, and a Start button. Today's planned routines come first, marked Today. Two tiles
// above the cards make a new routine or open Explore routines, the ready-made plans to copy
// from one routine at a time or as a whole week.
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { effectiveRoutineIds } from '../lib/history.js'
import { todayISO, uid } from '../lib/format.js'
import { EXIDX } from '../lib/exercises.js'
import { loadOfRoutine, rankOf, MUSCLE_NAME } from '../lib/muscles.js'
import { glyphOf, DEFAULT_GLYPH } from '../lib/glyphs.js'
import { starterCatalog, starterPlanDays } from '../lib/starter.js'
import { t, tn, exerciseNameFor } from '../lib/i18n.js'
import { startFlow, planCopy, loadStarterPlan, confirmSheet } from '../sheets.jsx'
import BodyMap from '../components/BodyMap.jsx'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { Tip } from '../components/Guide.jsx'
import '../workout-start.css'

const TINTS = ['var(--acc)', 'var(--blue)', 'var(--orange)', 'var(--pink)', 'var(--indigo)', 'var(--teal)', 'var(--red)']
const tintOf = id => TINTS[[...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TINTS.length]
const setsOf = r => r.ex.reduce((n, e) => n + (Number(e.sets) || 1), 0)

function RoutineCard({ r, body, today, onStart, onEdit, action }) {
  const load = loadOfRoutine(r)
  const top = rankOf(load).worked.slice(0, 3)
  const names = r.ex.slice(0, 3).map(e => (EXIDX[e.id] ? exerciseNameFor(EXIDX[e.id]) : e.n || e.id))
  return <div className={'rt-card' + (today ? ' today' : '')} style={{ '--tint': tintOf(r.id) }}>
    <div className="rt-head">
      <span className="rt-glyph"><Icon name={glyphOf(r.emoji)} /></span>
      <div className="grow" style={{ minWidth: 0 }}>
        {today && <div className="rt-today">{t('Today')}</div>}
        <div className="rt-name">{r.name}</div>
        <div className="rt-meta">{tn('{0} exercise', '{0} exercises', r.ex.length)} · {tn('{0} set', '{0} sets', setsOf(r))}</div>
      </div>
      {onEdit && <button className="iconbtn" onClick={onEdit} aria-label={t('Edit {0}', r.name)}><Icon name="pencil" /></button>}
    </div>
    <div className="rt-body">
      <div className="rt-info">
        {top.length > 0 && <div className="rt-muscles">{top.map(m => <span key={m} className="rt-chip">{t(MUSCLE_NAME[m])}</span>)}</div>}
        <ul className="rt-ex">
          {names.map((n, i) => <li key={i} className="capitalize">{n}</li>)}
          {r.ex.length > 3 && <li className="rt-more">{tn('+ {0} more', '+ {0} more', r.ex.length - 3)}</li>}
          {!r.ex.length && <li className="rt-more">{t('No exercises yet')}</li>}
        </ul>
      </div>
      <div className="rt-map"><BodyMap load={load} body={body} /></div>
    </div>
    {action || <Button variant={today ? 'primary' : 'tinted'} icon="play" disabled={!r.ex.length} onClick={onStart}>{t('Start routine')}</Button>}
  </div>
}

function Explore({ close }) {
  const body = useStore(s => s.S.body)
  const update = useStore(s => s.update)
  const add = r => {
    const copy = { ...r, id: uid(), ex: r.ex.map(e => ({ ...e })) }
    update(s => { s.routines.push(copy) })
    useUI.getState().toast(t('“{0}” added to your routines', r.name))
  }
  const whole = (id, name) => {
    close()
    const S = useStore.getState().S
    const days = starterPlanDays(id) || []
    const taken = days.some(d => [].concat(S.week[d] || []).some(x => S.routines.some(r => r.id === x)))
    if (!taken) { loadStarterPlan(id); return }
    confirmSheet({
      title: t('Load {0}?', name),
      message: t('Your existing routines stay; only those days of the weekly plan change.'),
      confirmText: t('Load plan'),
      onConfirm: () => loadStarterPlan(id),
    })
  }
  return <>
    <h3>{t('Explore routines')}</h3>
    <p className="small muted" style={{ marginTop: -4 }}>{t('Ready-made routines. Add the ones you like, or a whole week at once.')}</p>
    {starterCatalog().map(p => {
      const copy = planCopy(p.id) || { name: p.id, about: '' }
      return <section key={p.id} className="rt-plan">
        <div className="rt-plan-h">
          <div className="grow"><div className="rt-plan-n">{copy.name}</div>
            <div className="small muted">{t('{0} days per week', p.days)} · {copy.about}</div></div>
          <Button size="sm" variant="tinted" onClick={() => whole(p.id, copy.name)}>{t('Use plan')}</Button>
        </div>
        <div className="rt-scroll">
          {p.routines.map(r => <RoutineCard key={r.id} r={r} body={body}
            action={<Button size="sm" icon="plus" onClick={() => add(r)}>{t('Add routine')}</Button>} />)}
        </div>
      </section>
    })}
  </>
}
export const exploreSheet = () => useUI.getState().openSheet(close => <Explore close={close} />)

export default function WorkoutStart() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const todayIds = new Set(effectiveRoutineIds(S, todayISO()))
  const routines = [...S.routines.filter(r => todayIds.has(r.id)), ...S.routines.filter(r => !todayIds.has(r.id))]
  const newRoutine = () => {
    const r = { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] }
    update(s => { s.routines.push(r) })
    nav('/plan/r/' + r.id)
  }
  return <div className="narrow ws">
    <div className="hdr">
      <div><h1>{t('Workout')}</h1></div>
      <div className="hdr-actions">
        <button className="iconbtn" onClick={() => nav('/plan')} aria-label={t('Weekly plan')}><Icon name="calendar" /></button>
      </div>
    </div>

    <Tip id="workoutStart" icon="play" title={t('How to start')}>
      {t('Tap Start routine on one of your routines, or Start empty workout and add exercises as you go. No routine yet? Explore routines has ready-made ones to copy.')}
    </Tip>

    <button className="ws-empty" onClick={() => startFlow([])}>
      <span className="ws-empty-i"><Icon name="plus" /></span>
      <span className="grow"><span className="ws-empty-t">{t('Start empty workout')}</span>
        <span className="ws-empty-s">{t('Add exercises as you go')}</span></span>
      <Icon name="chevronRight" />
    </button>

    <div className="ws-sec"><h2>{t('Routines')}</h2>{routines.length > 0 && <span className="muted small">{routines.length}</span>}</div>
    <div className="ws-tiles">
      <button className="ws-tile" onClick={newRoutine}><Icon name="clipboard" /><span>{t('New routine')}</span></button>
      <button className="ws-tile" onClick={exploreSheet}><Icon name="magnifier" /><span>{t('Explore routines')}</span></button>
    </div>

    {routines.length
      ? routines.map(r => <RoutineCard key={r.id} r={r} body={S.body} today={todayIds.has(r.id)}
        onStart={() => startFlow([r.id])} onEdit={() => nav('/plan/r/' + r.id)} />)
      : <div className="ws-none">
        <div className="ws-none-i"><Icon name="clipboard" /></div>
        <h3>{t('No routines yet')}</h3>
        <p className="muted small">{t('A routine is a list of exercises you repeat, like “Push day”. Make your own, or pick a ready-made one.')}</p>
        <Button variant="primary" icon="magnifier" onClick={exploreSheet}>{t('Explore routines')}</Button>
      </div>}
  </div>
}
