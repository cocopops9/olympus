// Olympus: "Write it": a workout or a whole plan written as text, read by Hercules or Athena and
// turned into routines (lib/plan-text.js). Two steps in one sheet: the text (with the coach who
// reads it), then what the coach made of it, to check before saving. Every exercise shows what it
// was matched to in the catalogue; one that matched nothing, or only roughly, is marked and opens
// the exercise picker. A single workout can start right away or be kept as a routine; a plan is
// saved as routines, put on the weekdays the text named.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { socialReady } from '../lib/social.js'
import { herculesStatus, COACH_IDS } from '../lib/hercules.js'
import { askPlanText, draftOf, pickFor, draftIssues, takenDays, saveDraft, routineOf, draftUsable, PLAN_TEXT_MAX } from '../lib/plan-text.js'
import { exLine } from '../lib/history.js'
import { speedUnitOf } from '../lib/speed.js'
import { DAYS, DAYN, weekOrder, weekStartOf } from '../lib/format.js'
import { t, tn, exerciseNameFor } from '../lib/i18n.js'
import { track } from '../lib/telemetry.js'
import { exercisePicker, confirmSheet, startUnsavedRoutine } from '../sheets.jsx'
import { Avatar, coachName, statusOf, setCached, errorText } from './Hercules.jsx'
import { Button, TextArea, TextField, Switch } from './ui.jsx'
import Icon from './Icon.jsx'
import '../plan-text.css'

const DRAFT_KEY = 'olympus_plan_text'
const readText = () => { try { return localStorage.getItem(DRAFT_KEY) || '' } catch { return '' } }
const keepText = v => { try { if (v) localStorage.setItem(DRAFT_KEY, v); else localStorage.removeItem(DRAFT_KEY) } catch { /* only a convenience */ } }

function Item({ it, S, onPick, onDrop }) {
  const name = it.ex ? exerciseNameFor(it.ex) : it.said
  return <div className={'pt-item' + (!it.ex ? ' missing' : !it.sure ? ' guess' : '')}>
    <button type="button" className="pt-item-main" onClick={onPick}
      aria-label={it.ex ? t('Change {0}', name) : t('Choose an exercise for “{0}”', it.said)}>
      <span className="pt-item-n capitalize">{name}{it.sg && <span className="pt-ss"><Icon name="link" /></span>}</span>
      {it.ex
        ? <span className="pt-item-s">{exLine(it.cfg, S.unit, speedUnitOf(S))}{it.note ? ' · ' + it.note : ''}</span>
        : <span className="pt-item-s">{t('Not found in the catalogue. Tap to choose one.')}</span>}
      {it.ex && !it.sure && <span className="pt-item-s pt-said">{t('You wrote: {0}. Check it.', it.said)}</span>}
    </button>
    {!it.ex || !it.sure ? <Icon name="warning" className="pt-warn" /> : null}
    <button type="button" className="iconbtn pt-drop" onClick={onDrop} aria-label={t('Remove {0}', name)}><Icon name="xmark" /></button>
  </div>
}

function Days({ days, order, onToggle }) {
  return <div className="pt-days" role="group" aria-label={t('Weekdays')}>
    {order.map(d => <button key={d} type="button" className={'pt-day' + (days.includes(d) ? ' on' : '')} aria-pressed={days.includes(d)}
      aria-label={t(DAYN[d])} onClick={() => onToggle(d)}>{t(DAYS[d])}</button>)}
  </div>
}

function PlanText({ close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const user = useStore(s => s.user)
  const uidOf = user?.id
  const [text, setText] = useState(readText)
  const [ons, setOns] = useState(() => Object.fromEntries(COACH_IDS.map(id => [id, statusOf(uidOf, id)])))
  const [coach, setCoach] = useState('hercules')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [draft, setDraft] = useState(null)
  const [by, setBy] = useState('hercules')
  const [schedule, setSchedule] = useState(true)
  const gone = useRef(false)
  useEffect(() => () => { gone.current = true }, [])

  // Which coaches this server has, and how many messages each has left today.
  useEffect(() => {
    for (const id of COACH_IDS) {
      if (statusOf(uidOf, id)) continue
      herculesStatus(id).then(st => { setCached(uidOf, id, st); if (!gone.current) setOns(o => ({ ...o, [id]: st })) }, () => {})
    }
  }, [uidOf])
  const available = COACH_IDS.filter(id => ons[id]?.on)
  useEffect(() => { if (available.length && !available.includes(coach)) setCoach(available[0]) }, [available.join(), coach])
  const status = ons[coach]
  const checking = COACH_IDS.some(id => !ons[id])

  const read = async () => {
    const said = text.trim()
    if (!said || busy) return
    if (status && status.left === 0) { setErr(errorText({ data: { code: 'hercules-limit' } }, coachName(coach))); return }
    setBusy(true); setErr('')
    keepText(said)
    track('plantext.read')
    try {
      const res = await askPlanText(said, coach, useStore.getState().S)
      if (gone.current) return
      if (status) { const st = { ...status, left: res.left }; setCached(uidOf, coach, st); setOns(o => ({ ...o, [coach]: st })) }
      setBy(coach)
      setDraft(draftOf(res.plan, useStore.getState().S.customEx || []))
    } catch (e) {
      if (gone.current) return
      if (e?.data?.code === 'hercules-limit') { const st = { ...(status || {}), left: 0 }; setCached(uidOf, coach, st); setOns(o => ({ ...o, [coach]: st })) }
      setErr(e?.data?.code === 'plan-text-unclear'
        ? t('{0} could not find a workout in that text. Write the exercises with their sets and reps, like “Bench press 4x8 80 kg”.', coachName(coach))
        : errorText(e, coachName(coach)))
    } finally { if (!gone.current) setBusy(false) }
  }

  const order = weekOrder(weekStartOf(S))
  const editRoutine = (rk, fn) => setDraft(d => ({ ...d, routines: d.routines.map(r => (r.key === rk ? fn(r) : r)) }))
  const editItem = (rk, ik, fn) => editRoutine(rk, r => ({ ...r, items: r.items.map(it => (it.key === ik ? fn(it) : it)) }))
  // The picker opens on a search for what was written; with a rough match, its muscle comes first.
  const pick = (rk, it) => {
    const picker = exercisePicker(ex => { editItem(rk, it.key, cur => pickFor(cur, ex)); picker.close() },
      { title: it.ex ? t('Change exercise') : t('Choose an exercise'), like: it.ex && !it.sure ? it.ex.id : undefined, query: it.ex && !it.sure ? undefined : it.said })
  }
  const drop = (rk, ik) => editRoutine(rk, r => ({ ...r, items: r.items.filter(it => it.key !== ik) }))
  const toggleDay = (rk, d) => editRoutine(rk, r => ({ ...r, days: r.days.includes(d) ? r.days.filter(x => x !== d) : [...r.days, d].sort() }))

  if (draft) {
    const { missing, guesses } = draftIssues(draft)
    const usable = draftUsable(draft)
    const hasDays = draft.routines.some(r => r.days.length)
    const kept = draft.routines.filter(r => r.items.some(it => it.ex)).length
    const save = () => {
      const s = useStore.getState().S
      const days = schedule ? takenDays(s, draft) : []
      const go = () => {
        let ids = []
        update(st => { ids = saveDraft(st, draft, { schedule }) })
        track('plantext.save')
        keepText('')
        close()
        useUI.getState().toast(tn('{0} routine added', '{0} routines added', ids.length))
      }
      if (!days.length) { go(); return }
      confirmSheet({
        title: t('Replace those days?'),
        message: t('{0} already have a routine. Your routines stay; only those days of the weekly plan change.', new Intl.ListFormat(undefined).format(days.map(d => t(DAYN[d])))),
        confirmText: t('Replace'),
        onConfirm: go,
      })
    }
    const startNow = () => {
      const r = routineOf(draft.routines[0])
      if (!r.ex.length) return
      track('plantext.start')
      keepText('')
      close()
      startUnsavedRoutine(r)
    }
    return <div className="pt">
      <div className="pt-head">
        <Avatar size="sm" coach={by} />
        <div className="grow">
          <h3>{draft.kind === 'plan' ? t('Your plan') : t('Your workout')}</h3>
          <div className="small muted">{t('Read by {0}. Check it, then save.', coachName(by))}</div>
        </div>
      </div>
      {draft.comment && <p className="pt-comment">{draft.comment}</p>}
      {(missing > 0 || guesses > 0) && <p className="pt-note"><Icon name="warning" />
        {[missing ? t('Not found: {0}', missing) : null, guesses ? t('To check: {0}', guesses) : null].filter(Boolean).join(' · ')}
        {'. '}{t('Tap one to choose the right exercise.')}</p>}
      {draft.routines.map(r => <section key={r.key} className="pt-routine">
        <TextField className="pt-rname" value={r.name} maxLength={40} aria-label={t('Routine name')}
          onChange={e => { const v = e.target.value; editRoutine(r.key, x => ({ ...x, name: v })) }} />
        {draft.kind === 'plan' && <Days days={r.days} order={order} onToggle={d => toggleDay(r.key, d)} />}
        {r.items.map(it => <Item key={it.key} it={it} S={S} onPick={() => pick(r.key, it)} onDrop={() => drop(r.key, it.key)} />)}
        {!r.items.length && <p className="small muted">{t('No exercises left.')}</p>}
      </section>)}
      {draft.kind === 'plan' && hasDays && <div className="pt-sched"><span className="grow">{t('Put them on these weekdays')}</span>
        <Switch checked={schedule} onChange={setSchedule} aria-label={t('Put them on these weekdays')} /></div>}
      <div className="pt-actions">
        {draft.kind === 'workout'
          ? <>
            <Button variant="primary" icon="play" disabled={!usable} onClick={startNow}>{t('Start now')}</Button>
            <Button variant="tinted" icon="clipboard" disabled={!usable} onClick={save}>{t('Save as routine')}</Button>
          </>
          : <Button variant="primary" icon="clipboard" disabled={!usable} onClick={save}>{kept > 1 ? t('Save the routines') : t('Save as routine')}</Button>}
        <Button variant="plain" icon="pencil" onClick={() => setDraft(null)}>{t('Back to the text')}</Button>
      </div>
    </div>
  }

  return <div className="pt">
    <h3>{t('Write a workout or a plan')}</h3>
    <p className="small muted" style={{ marginTop: -4 }}>{t('Write or paste it the way you would in a note, in any language. Your coach turns it into routines you can check before saving.')}</p>
    {available.length > 0 && <div className="pt-coaches" role="radiogroup" aria-label={t('Who reads it')}>
      {available.map(id => <button key={id} type="button" role="radio" aria-checked={coach === id} className={'pt-coach' + (coach === id ? ' on' : '')} onClick={() => setCoach(id)}>
        <Avatar size="sm" coach={id} badge={false} /><span>{coachName(id)}</span>
      </button>)}
    </div>}
    {/* The example's lines are kept apart by bars in the string, so it is one key for translators. */}
    <TextArea className="pt-text" rows={9} maxLength={PLAN_TEXT_MAX} value={text} disabled={busy}
      placeholder={t('Push day|Bench press 4x6-8 80 kg|Incline dumbbell press 3x10|Lateral raises 3x15, superset with triceps pushdown 3x12||Pull day (Thursday)|Pull-ups 4x8|...').split('|').join('\n')}
      onChange={e => { setText(e.target.value); setErr('') }} />
    {err && <p className="pt-err" role="alert">{err}</p>}
    {!checking && !available.length && <p className="pt-err">{t('Hercules and Athena are not available on this server.')}</p>}
    <div className="pt-actions">
      <Button variant="primary" icon="sparkles" disabled={busy || !text.trim() || !available.length} onClick={read}>
        {busy ? t('{0} is reading…', coachName(coach)) : t('Turn it into routines')}
      </Button>
    </div>
    {status && status.on && <p className="small muted pt-left">{t('It uses one message of {0}. Left today: {1}', coachName(coach), status.left)}</p>}
  </div>
}

/** Whether "Write it" can be offered: a server account, on a server where a coach is not known to be off. */
export const planTextReady = user => socialReady(user) && !COACH_IDS.every(id => statusOf(user?.id, id)?.on === false)

export const planTextSheet = () => {
  const user = useStore.getState().user
  if (!planTextReady(user)) { useUI.getState().toast(t('Sign in to an Olympus account to have your coach read it.')); return }
  useUI.getState().openSheet(close => <PlanText close={close} />)
}
