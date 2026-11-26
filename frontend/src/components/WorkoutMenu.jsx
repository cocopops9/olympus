import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtRest } from '../lib/duration.js'
import { sessionNoProg } from '../lib/session-noprog.js'
import Icon from './Icon.jsx'
import Meander from './Meander.jsx'
import { Section, Row, Switch } from './ui.jsx'

// The workout header's ⋯, as one page in the gold on black of Settings → Workout (.wset) rather
// than a column of look-alike rows. What it does is unchanged; how it reads is:
// - the workout's name is the sheet's title, and tapping it renames (no "Rename workout" row);
// - adding is two big tiles, the one thing people open this menu for mid-session;
// - the layouts are pictures picked in place, without a second sheet;
// - session note, "don't count for progression" (a real switch, not a row that toggles a
//   check nobody saw) and the way into Workout settings share one card;
// - Discard is a quiet red link at the foot, away from everything else.
// Values are read live from the store, so a layout or switch changed here shows at once; the
// actions come from views/Workout.jsx, and one that is not offered (editing a saved workout has
// no Add routine and no Discard) is passed as null.

export const WORKOUT_LAYOUTS = ['cards', 'list', 'compact', 'focus']
const LAYOUT_ICON = { cards: 'layout', list: 'list', compact: 'compact', focus: 'target' }
const layoutLabel = v => ({ cards: t('Cards'), list: t('List'), compact: t('Compact'), focus: t('Focus') })[v]

/** This session's layout: its own choice from this menu, else the saved one, else cards. */
export function sessionLayout(S) {
  const v = S.active?.workoutView || S.workoutView
  return WORKOUT_LAYOUTS.includes(v) ? v : 'cards'
}

/** "1:30 rest · Sound": what the Workout settings row shows of the settings behind it. */
export function settingsSummary(S) {
  return [S.restSec > 0 ? t('{0} rest', fmtRest(S.restSec)) : t('No rest timer'), S.sound ? t('Sound') : t('Silent')].join(' · ')
}

export function WorkoutMenu({ actions, close }) {
  const S = useStore(s => s.S)
  const A = S.active
  if (!A) return null
  const run = fn => () => { close(); fn() }
  const layout = sessionLayout(S)
  const listMode = layout === 'list' || layout === 'compact'
  const collapseOn = listMode && !!(A.collapseCompleted ?? S.collapseCompleted)
  const note = (A.note || '').trim()
  const {
    onRename, onAddExercise, onAddRoutine, onMarkAllDone, onLayout, onToggleCollapse,
    onNote, onToggleNoProg, onSettings, onDiscard,
  } = actions

  return <div className="wset wmenu">
    <button type="button" className="wmenu-hd" aria-label={t('Rename workout')} onClick={run(onRename)}>
      <span className="wmenu-name">{A.name}</span>
      <Icon name="pencil" className="wmenu-pen" />
    </button>
    <div className="wmenu-sub">{t('{0} exercises', A.entries.length)}</div>
    <Meander id="wmenu-key" className="wmenu-key" />

    {onMarkAllDone && <button type="button" className="btn primary wmenu-done" onClick={run(onMarkAllDone)}>
      <Icon name="checkCircle" />{t('Mark all sets done')}
    </button>}

    <section className="sect">
      <h2 className="sect-t">{t('Add')}</h2>
      <div className={'wmenu-add' + (onAddRoutine ? '' : ' one')}>
        <button type="button" className="wset-tile main wmenu-tile" onClick={run(onAddExercise)}>
          <span className="wmenu-ti"><Icon name="plusCircle" /></span>
          <span className="wmenu-tl">{t('Add exercise')}</span>
        </button>
        {onAddRoutine && <button type="button" className="wset-tile wmenu-tile" onClick={run(onAddRoutine)}>
          <span className="wmenu-ti"><Icon name="clipboard" /></span>
          <span className="wmenu-tl">{t('Add routine')}</span>
        </button>}
      </div>
    </section>

    <Section title={t('Layout')}>
      <div className="wset-layouts" role="radiogroup" aria-label={t('Layout')}>
        {WORKOUT_LAYOUTS.map(v => <button key={v} type="button" role="radio" aria-checked={layout === v}
          className={'wset-lay' + (layout === v ? ' on' : '')} onClick={() => onLayout(v)}>
          <Icon name={LAYOUT_ICON[v]} /><span>{layoutLabel(v)}</span>
        </button>)}
      </div>
      {listMode && <Row icon="minimize" title={t('Collapse completed exercises')} subtitle={t('Keep the current exercise open')}>
        <Switch aria-label={t('Collapse completed exercises')} checked={collapseOn} onChange={() => onToggleCollapse()} />
      </Row>}
    </Section>

    <Section title={t('This workout')}>
      <Row icon="note" title={note ? t('Edit session note') : t('Add session note')} subtitle={note || null}
        className="wmenu-note" accessory="chevron" onClick={run(onNote)} />
      {onToggleNoProg && <Row icon="chartLineSlash" title={t('Don’t count for progression')} subtitle={t('Every exercise in this workout')}>
        <Switch aria-label={t('Don’t count for progression')} checked={sessionNoProg(A)} onChange={() => onToggleNoProg()} />
      </Row>}
      <Row icon="gear" title={t('Workout settings')} subtitle={settingsSummary(S)} accessory="chevron" onClick={run(onSettings)} />
    </Section>

    {onDiscard && <button type="button" className="wmenu-discard" onClick={run(onDiscard)}>
      <Icon name="trash" />{t('Discard workout')}
    </button>}
  </div>
}

/** Opens the workout's ⋯ sheet; `actions` as WorkoutMenu takes them. */
export function workoutMenuSheet(actions) {
  return useUI.getState().openSheet(close => <WorkoutMenu actions={actions} close={close} />)
}
