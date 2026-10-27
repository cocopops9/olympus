import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import '../structural-balance.css'
import { useStore } from '../store/useStore.js'
import { exOr } from '../lib/exercises.js'
import { t, exerciseNameFor, exerciseNameClass } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Button, Segmented } from '../components/ui.jsx'
import { exercisePicker, bwSheet } from '../sheets.jsx'
import { computeBalance, overrideKey, withOverride } from '../lib/structuralBalance.js'
import { balanceStatusView } from '../lib/structuralBalance-view.js'
import { TEMPLATES, TEMPLATE_LIST, DEFAULT_TEMPLATE_ID, EVALUATION_MODES, BORDERLINE_BAND_PCT } from '../lib/structuralBalanceTemplates.js'
import { useUI } from '../store/useUI.js'

// A role pointed at a custom exercise since deleted (on this device or another) still names
// something rather than showing a blank line.
const exerciseName = id => (id ? exerciseNameFor(exOr(id)) : null)

export default function StructuralBalance() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
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

  // The verdict first, in words: the weakest scored lift, or that they are all in line.
  // The anchor lift is 100% of itself: only the lifts held against something say anything.
  const isAnchor = r => { const role = template.roles.find(x => x.id === r.roleId); return role?.evaluationMode === EVALUATION_MODES.LOAD_RATIO && !role.anchorRoleId }
  const scored = results.filter(r => r.status !== 'no-data' && !isAnchor(r) && Number.isFinite(reachOf(r, template)))
  const weakest = scored.slice().sort((a, b) => reachOf(a, template) - reachOf(b, template))[0] || null
  const count = st => results.filter(r => r.status === st).length
  const anchorRole = template.roles.find(r => r.evaluationMode === EVALUATION_MODES.LOAD_RATIO && !r.anchorRoleId)

  return <>
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/stats')} aria-label={t('Stats')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Structural balance')}</h1>
        <div className="sub">{t('Compare your lifts against a published ratio table to find the weak link.')}</div></div></div>

    <Segmented className="seg-range" value={templateId}
      onChange={id => update(s => { s.balanceTemplate = id })}
      options={TEMPLATE_LIST.map(tpl => ({ value: tpl.id, label: t(tpl.label) }))} />

    <div className="card sb-sum">
      {weakest && weakest.status !== 'balanced'
        ? <><div className="sb-sum-k">{t('Your weak link')}</div>
          <div className="sb-sum-v">{t(template.roles.find(r => r.id === weakest.roleId).label)}</div>
          <div className="small muted">{t('At {0}% of where the table puts it compared with your other lifts. Training it more would even you out.', Math.round(reachOf(weakest, template)))}</div></>
        : scored.length
          ? <><div className="sb-sum-k">{t('Well balanced')}</div><div className="small muted">{t('Every lift with data is in line with the others.')}</div></>
          : <><div className="sb-sum-k">{t('Not enough data yet')}</div><div className="small muted">{t('Log the lifts below to see how they compare.')}</div></>}
      <div className="sb-counts">
        {[['balanced', 'Balanced'], ['borderline', 'Borderline'], ['weak', 'Weak'], ['no-data', 'No data']].map(([st, label]) => count(st) > 0 &&
          <button key={st} className={'sb-count s-' + st} onClick={() => statusInfoSheet(st)} aria-label={t('What {0} means', t(label))}>
            <i />{t(label)} <b>{count(st)}</b><Icon name="info" className="sb-info" /></button>)}
      </div>
      <details className="sb-how">
        <summary>{t('How to read this')}</summary>
        <p className="small muted">{anchorRole
          ? t('Each lift is compared with your {0}, by estimated 1RM. The bar is how close you are to the ratio the table asks for: the line in the middle is the target.', t(anchorRole.label).replace(/\s*\(.*\)$/, '').toLowerCase())
          : t('Each lift is compared with what the table asks for. The bar is how close you are: the line in the middle is the target.')}
          {' '}{t('Balanced is on target, Borderline is a little under, Weak is clearly behind.')}</p>
      </details>
    </div>

    <div className="card sb-list">
      {results.map(r => {
        const role = template.roles.find(role => role.id === r.roleId)
        const view = balanceStatusView(r.status, r.needsAnchor)
        const exId = r.mappedExerciseId || r.configuredExerciseId
        const name = exerciseName(exId)
        const reps = role.evaluationMode === EVALUATION_MODES.REP_COUNT
        const bw = role.evaluationMode === EVALUATION_MODES.BODYWEIGHT_RATIO
        const anchor = !reps && !bw && !!role.anchorRoleId
        const reach = r.status === 'no-data' ? null : reachOf(r, template)
        const actual = r.status === 'no-data' ? '–' : reps ? r.current.r : `${Math.round(r.actualPct)}%`
        const valueText = `${actual} / ${r.targetPct}${reps ? '' : '%'}`
        const detail = r.status === 'no-data' ? null
          : reps ? t('{0} reps, target {1}', r.current.r, r.targetPct)
            : bw ? t('{0}% of your body weight, target {1}%', Math.round(r.actualPct), r.targetPct)
              : anchor ? t('{0}% of the anchor lift, target {1}%', Math.round(r.actualPct), r.targetPct)
                : t('The lift the others are compared with')
        return (
          <div key={r.roleId} className="mrow sb-row" data-role-id={r.roleId} data-status={r.status}
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
                <button className={'sb-badge s-' + r.status} onClick={() => statusInfoSheet(r.status)} aria-label={t('What {0} means', t(view.label))}>
                  {t(view.label)}<Icon name="info" className="sb-info" /></button>
                <span className="dim small sb-ratio" style={{ display: 'block' }} title={valueText}>{valueText}</span>
              </span>
            </div>
            {reach != null && <div className={'sb-gauge s-' + r.status} aria-hidden="true">
              <i style={{ width: Math.min(100, reach / GAUGE_MAX * 100) + '%' }} /><b style={{ left: 100 / GAUGE_MAX * 100 + '%' }} />
            </div>}
            {detail && <div className="small muted">{detail}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {r.needsBodyweight && <Button size="sm" variant="ghost" icon="plus" onClick={() => bwSheet()}>{t('Log body weight')}</Button>}
              <Button size="sm" variant="ghost" icon="pencil" onClick={() => changeExercise(role)}>{t('Change exercise')}</Button>
              {r.isOverridden && <Button size="sm" variant="ghost" onClick={() => clearOverride(role)}>{t('Use default exercise')}</Button>}
            </div>
          </div>
        )
      })}
    </div>
  </>
}

// What each verdict means, from the badge or the counts at the top (lib/structuralBalance.js
// classify: on target, up to BORDERLINE_BAND_PCT points under it, or further under).
const STATUS_HELP = [
  ['balanced', 'Balanced', () => t('The lift is at the ratio the table asks for, or above it. Nothing to fix.')],
  ['borderline', 'Borderline', () => t('A little under the ratio: up to {0} points below the target. Worth watching, not a problem yet.', BORDERLINE_BAND_PCT)],
  ['weak', 'Weak', () => t('Clearly under the ratio: more than {0} points below the target. This is the lift that holds the others back; train it more often or with more volume.', BORDERLINE_BAND_PCT)],
  ['no-data', 'No data', () => t('No set of this lift yet in your history, or a value it needs (your body weight, or the anchor lift) is missing.')],
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
