import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import '../structural-balance.css'
import { useStore } from '../store/useStore.js'
import { exOr } from '../lib/exercises.js'
import { t, tn, exerciseNameFor, exerciseNameClass } from '../lib/i18n.js'
import { fmtNum, fmtDate } from '../lib/format.js'
import { LB_TO_KG } from '../lib/recovery.js'
import { statsDetailOf } from '../lib/stats-cards.js'
import Icon from '../components/Icon.jsx'
import { Button, Segmented } from '../components/ui.jsx'
import { Tip } from '../components/Guide.jsx'
import { exercisePicker, bwSheet } from '../sheets.jsx'
import { computeBalance, overrideKey, withOverride } from '../lib/structuralBalance.js'
import { balanceStatusView } from '../lib/structuralBalance-view.js'
import { TEMPLATES, TEMPLATE_LIST, DEFAULT_TEMPLATE_ID, EVALUATION_MODES, BORDERLINE_BAND_PCT } from '../lib/structuralBalanceTemplates.js'
import { useUI } from '../store/useUI.js'

// A role pointed at a custom exercise since deleted (on this device or another) still names
// something rather than showing a blank line.
const exerciseName = id => (id ? exerciseNameFor(exOr(id)) : null)
// A role's lift without the table's note in brackets ("Dips (bodyweight + load)" → "Dips"), for
// the sentences that name it.
const liftName = role => t(role.label).replace(/\s*\(.*\)$/, '')

// The screen reads in two layers. On top, for anyone: which lift to work on, and for each lift
// what you do now against what to aim for, in kilos or reps. Under each row's Details (open from
// the start in Stats → Detailed), the method: the ratio and its target, the best set it came from,
// and the exercise the role reads.
export default function StructuralBalance() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const detailed = statsDetailOf(S) === 'detailed'
  // Own keys only: a synced or imported id such as "constructor" would otherwise find an
  // Object.prototype member and take the screen down.
  const templateId = Object.prototype.hasOwnProperty.call(TEMPLATES, S.balanceTemplate) ? S.balanceTemplate : DEFAULT_TEMPLATE_ID
  const template = TEMPLATES[templateId]
  const results = useMemo(() => computeBalance(S, template), [S, template])

  const setOverride = (role, exId) => update(s => {
    s.balanceOverrides = withOverride(s.balanceOverrides, overrideKey(template, role), exId)
  })
  const clearOverride = role => setOverride(role, null)
  // Headed by what a pick does here, like the routine editor's Replace (#110): the picker's own
  // heading is "Add exercise".
  const changeExercise = role => {
    const picker = exercisePicker(ex => { setOverride(role, ex.id); picker.close() }, { title: t('Change exercise') })
  }

  // Figures in the profile's unit: to the half kilo, or the whole pound.
  const weight = kg => fmtNum(S.unit === 'lb' ? Math.round(kg / LB_TO_KG) : Math.round(kg * 2) / 2) + ' ' + S.unit
  // A rep count reads "{0} reps" as everywhere else in the app (one rep alone "{0} rep"). Not
  // tn(): Russian, Ukrainian and Polish keep "{0} reps" a single string, which other screens read.
  const repsText = n => t(n === 1 ? '{0} rep' : '{0} reps', n)
  const amount = (goal, value) => goal.kind === 'reps' ? repsText(value)
    : goal.reps > 1 ? t('{0} for {1} reps', weight(value), goal.reps) : weight(value)

  // The verdict first, in words: the weakest scored lift, or that they are all in line.
  // The anchor lift is 100% of itself: only the lifts held against something say anything.
  const isAnchor = r => { const role = template.roles.find(x => x.id === r.roleId); return role?.evaluationMode === EVALUATION_MODES.LOAD_RATIO && !role.anchorRoleId }
  const scored = results.filter(r => r.status !== 'no-data' && !isAnchor(r) && Number.isFinite(reachOf(r, template)))
  const weakest = scored.slice().sort((a, b) => reachOf(a, template) - reachOf(b, template))[0] || null
  const count = st => results.filter(r => r.status === st && !isAnchor(r)).length
  const anchors = template.roles.filter(r => r.evaluationMode === EVALUATION_MODES.LOAD_RATIO && !r.anchorRoleId)
  const anchorLogged = anchors.some(role => results.find(r => r.roleId === role.id)?.status !== 'no-data')
  const weakRole = weakest && template.roles.find(r => r.id === weakest.roleId)

  return <>
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/stats')} aria-label={t('Stats')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Structural balance')}</h1>
        <div className="sub">{t('Are your lifts in proportion to each other?')}</div></div></div>

    <Tip id="structural" icon="layout" title={t('What is structural balance?')}>
      {t('Your lifts support each other. When one falls far behind the rest, it holds back your progress and can strain your joints. This screen compares your best lifts with each other and tells you which one to work on.')}
    </Tip>

    <div className="sb-std">
      <div className="small muted sb-std-l">{t('Standard')}</div>
      <Segmented className="seg-range" value={templateId}
        onChange={id => update(s => { s.balanceTemplate = id })}
        options={TEMPLATE_LIST.map(tpl => ({ value: tpl.id, label: t(tpl.label) }))} />
      {template.about && <div className="small muted sb-std-about" data-template-about>{t(template.about)}</div>}
    </div>

    <div className="card sb-sum" data-verdict={weakest && weakest.status !== 'balanced' ? 'weak-link' : scored.length ? 'balanced' : 'empty'}>
      {weakest && weakest.status !== 'balanced'
        ? <><div className="sb-sum-k">{t('Work on this first')}</div>
          <div className="sb-sum-v">{liftName(weakRole)}</div>
          {weakest.goal?.now != null && weakest.goal?.target != null && <div className="small">
            {weakest.goal.kind === 'reps'
              ? t('You do {0}. The goal is {1}.', amount(weakest.goal, weakest.goal.now), amount(weakest.goal, weakest.goal.target))
              : t('You lift about {0}. In proportion with your other lifts, it would be about {1}.', amount(weakest.goal, weakest.goal.now), amount(weakest.goal, weakest.goal.target))}
          </div>}
          <div className="small muted">{t('Give it more attention: put it first in a workout, or add a few sets each week. Check back in a month.')}</div></>
        : scored.length
          ? <><div className="sb-sum-k">{t('Well balanced')}</div><div className="small muted">{t('Your lifts are in proportion. Keep training them all.')}</div></>
          : <><div className="sb-sum-k">{t('Not enough data yet')}</div>
            <div className="small muted">{!anchorLogged && anchors.length
              ? t('Start by logging your {0}: the other lifts are measured against it.', anchors.map(liftName).join(' · '))
              : t('Log the lifts below to see how they compare.')}</div></>}
      <div className="sb-counts">
        {[['balanced', 'On track'], ['borderline', 'Slightly behind'], ['weak', 'Behind'], ['no-data', 'Not measured']].map(([st, label]) => count(st) > 0 &&
          <button key={st} className={'sb-count s-' + st} onClick={() => statusInfoSheet(st)} aria-label={t('What {0} means', t(label))}>
            <i />{t(label)} <b>{count(st)}</b><Icon name="info" className="sb-info" /></button>)}
      </div>
      <details className="sb-how">
        <summary>{t('How to read this')}</summary>
        <p className="small muted">{anchors.length
          ? t('Each lift is compared with the lift at the top of its group. The bar shows how close you are to the right proportion; the line is the goal.')
          : t('Each lift is compared with your body weight, or counted in reps. The bar shows how close you are; the line is the goal.')}</p>
        <p className="small dim">{t('Lifts measured in weight use your estimated one-rep max (Epley formula) from your best logged set; lifts with a rep count use the weight you showed for that many reps. Slightly behind means up to {0} points under the target ratio, Behind means further. The ratios are the {1} table; women get the table’s own figures where it gives them.', BORDERLINE_BAND_PCT, t(template.label))}</p>
      </details>
    </div>

    <div className="card sb-list">
      {results.map(r => {
        const role = template.roles.find(role => role.id === r.roleId)
        const anchor = isAnchor(r)
        const view = anchor ? { label: 'Reference' } : balanceStatusView(r.status, r.needsAnchor)
        const exId = r.mappedExerciseId || r.configuredExerciseId
        const name = exerciseName(exId)
        const reps = role.evaluationMode === EVALUATION_MODES.REP_COUNT
        const bw = role.evaluationMode === EVALUATION_MODES.BODYWEIGHT_RATIO
        const reach = r.status === 'no-data' || anchor ? null : reachOf(r, template)
        const goal = r.goal || {}
        const gap = goal.now != null && goal.target != null ? goal.target - goal.now : null
        const ratio = r.status === 'no-data' ? null
          : reps ? t('{0} reps, target {1}', r.current.r, r.targetPct)
            : bw ? t('{0}% of your body weight, target {1}%', Math.round(r.actualPct), r.targetPct)
              : anchor ? t('The lift the others are compared with')
                : t('{0}% of the anchor lift, target {1}%', Math.round(r.actualPct), r.targetPct)
        const day = r.current?.d ? String(r.current.d).slice(0, 10) : null
        return <div key={r.roleId} className="sb-block">
          {anchor && <div className="sb-group" data-group={r.roleId}>{t('Measured against your {0}', liftName(role))}</div>}
          <div className={'mrow sb-row' + (anchor ? ' sb-anchor' : '')} data-role-id={r.roleId} data-status={r.status}
            style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, paddingBlock: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span className="nm" style={{ minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                <span style={{ display: 'block' }} className="sb-lift">{t(role.label)}</span>
                <span className="small dim" style={{ display: 'block' }}>
                  <span className={exId ? exerciseNameClass(exOr(exId)) : ''} data-exercise-name>{name}</span>{r.isOverridden ? ` · ${t('Custom')}` : ''}
                </span>
                {r.needsBodyweight && <span className="small" data-needs-bodyweight style={{ display: 'block', color: 'var(--label-2)' }}>
                  {t('Log your body weight to score this lift.')}
                </span>}
                {r.needsAnchor && <span className="small" data-needs-anchor style={{ display: 'block', color: 'var(--label-2)' }}>
                  {t('Log the anchor lift to score this one.')}
                </span>}
              </span>
              <span className="v" style={{ textAlign: 'end', flexShrink: 0 }}>
                {anchor
                  ? <span className="sb-badge s-anchor">{t(view.label)}</span>
                  : <button className={'sb-badge s-' + r.status} onClick={() => statusInfoSheet(r.status)} aria-label={t('What {0} means', t(view.label))}>
                    {t(view.label)}<Icon name="info" className="sb-info" /></button>}
              </span>
            </div>
            {reach != null && <div className={'sb-gauge s-' + r.status} aria-hidden="true">
              <i style={{ width: Math.min(100, reach / GAUGE_MAX * 100) + '%' }} /><b style={{ left: 100 / GAUGE_MAX * 100 + '%' }} />
            </div>}
            {/* What you do, what to aim for, and how far that is: the row's whole message. */}
            {anchor
              ? <div className="small muted">{goal.now != null
                ? <>{t('The other lifts in this group are measured against this one.')} {t('Your estimated max: {0}', weight(goal.now))}</>
                : t('Log this lift first: the other lifts in this group are measured against it.')}</div>
              : (goal.now != null || goal.target != null) && <div className="sb-goal" data-goal>
                <span><span className="dim">{t('Now')}</span> <b>{goal.now != null ? amount(goal, goal.now) : '–'}</b></span>
                {goal.target != null && <span><span className="dim">{t('Aim for')}</span> <b>{amount(goal, goal.target)}</b></span>}
                {gap != null && <span className={gap > 0 ? 'sb-gap' : 'sb-gap done'}>{gap > 0
                  ? t('{0} to go', goal.kind === 'reps' ? repsText(Math.ceil(gap)) : weight(gap))
                  : t('Goal reached')}</span>}
              </div>}
            {!anchor && goal.kind === 'kg' && (goal.now != null || goal.target != null) && <div className="small dim">
              {goal.reps > 1 ? t('Weight for {0} reps, worked out from your best set.', goal.reps) : t('Estimated one-rep max, worked out from your best set.')}
            </div>}
            {r.needsBodyweight && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Button size="sm" variant="ghost" icon="plus" onClick={() => bwSheet()}>{t('Log body weight')}</Button>
            </div>}
            <details className="sb-more" open={detailed}>
              <summary>{t('Details')}</summary>
              {ratio && <div className="small muted sb-ratio" data-ratio>{ratio}</div>}
              {r.current && day && <div className="small muted">{t('Best set: {0} on {1}', reps || !(r.current.w > 0)
                ? repsText(r.current.r)
                : fmtNum(r.current.w) + ' ' + S.unit + ' × ' + r.current.r, fmtDate(day, true))}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                <Button size="sm" variant="ghost" icon="pencil" onClick={() => changeExercise(role)}>{t('Change exercise')}</Button>
                {r.isOverridden && <Button size="sm" variant="ghost" onClick={() => clearOverride(role)}>{t('Use default exercise')}</Button>}
              </div>
            </details>
          </div>
        </div>
      })}
    </div>
  </>
}

// What each verdict means, from the badge or the counts at the top (lib/structuralBalance.js
// classify: on target, up to BORDERLINE_BAND_PCT points under it, or further under).
const STATUS_HELP = [
  ['balanced', 'On track', () => t('This lift is where it should be compared with your other lifts, or stronger. Nothing to fix.')],
  ['borderline', 'Slightly behind', () => t('A little behind the others: up to {0} points under the target. Worth keeping an eye on, not a problem yet.', BORDERLINE_BAND_PCT)],
  ['weak', 'Behind', () => t('Clearly behind the others: more than {0} points under the target. This is the lift holding the rest back; train it more often, or with a few more sets.', BORDERLINE_BAND_PCT)],
  ['no-data', 'Not measured', () => t('There is no set of this lift in your history yet, or something it needs is missing: your body weight, or the lift it is measured against.')],
]
function statusInfoSheet(focus) {
  useUI.getState().openSheet(close => <div className="sb-help">
    <h3 style={{ marginBottom: 10 }}>{t('What the verdicts mean')}</h3>
    {STATUS_HELP.map(([st, label, text]) => <div key={st} className={'sb-help-row s-' + st + (st === focus ? ' on' : '')}>
      <span className={'sb-badge s-' + st}>{t(label)}</span>
      <p className="small">{text()}</p>
    </div>)}
    <Button variant="primary" onClick={close}>{t('Done')}</Button>
  </div>)
}

// How close a scored lift is to its target, in % of the target (100 = on target).
const GAUGE_MAX = 130
function reachOf(r, template) {
  const role = template.roles.find(x => x.id === r.roleId)
  if (!role || !(r.targetPct > 0)) return NaN
  const actual = role.evaluationMode === EVALUATION_MODES.REP_COUNT ? Number(r.current?.r) : Number(r.actualPct)
  return Number.isFinite(actual) ? actual / r.targetPct * 100 : NaN
}
