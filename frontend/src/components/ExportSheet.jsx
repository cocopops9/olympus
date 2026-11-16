// Olympus: Export data (Settings → Data): which data, over which period, in which format
// (lib/data-export.js writes the file). The backup next to it is for bringing everything back
// into the app; this is for reading part of it elsewhere.
import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import { MOBILE, shareExport, shareExportBlob } from '../lib/mobile.js'
import { track } from '../lib/telemetry.js'
import { EXPORT_PERIODS, periodRange, exportCounts, buildExport } from '../lib/data-export.js'
import { Section, Row, Switch, Segmented, Button } from './ui.jsx'
import '../export.css'

const DATA = [
  { id: 'workouts', icon: 'dumbbell', label: () => t('Workouts'), count: c => t('Workouts: {0}, sets: {1}', c.workouts, c.sets) },
  { id: 'bodyweight', icon: 'scale', label: () => t('Body weight'), count: c => t('Weigh-ins: {0}', c.bodyweight) },
  { id: 'measurements', icon: 'ruler', label: () => t('Measurements'), count: c => t('Days measured: {0}', c.measurements) },
  { id: 'routines', icon: 'list', label: () => t('Routines'), count: c => t('Routines: {0}, in every period', c.routines) },
]
const PERIOD_LABEL = {
  week: () => t('Last 7 days'), month: () => t('Last 30 days'), '3months': () => t('Last 3 months'), year: () => t('Last 12 months'),
  all: () => t('Everything'), custom: () => t('Choose dates'),
}
const FORMAT_HINT = {
  csv: () => t('A table for a spreadsheet or another app. Workouts are laid out like Strong’s export, which most apps can import. More than one table comes as a .zip.'),
  xlsx: () => t('One Excel workbook with a sheet per table. Opens in Excel, Numbers, Google Sheets and LibreOffice.'),
  json: () => t('The data as the app keeps it, for a program to read.'),
}

// Writes the file: the share sheet on the phone, a download in a browser.
async function save({ name, type, data }) {
  if (MOBILE) {
    if (typeof data === 'string') await shareExport(data, name)
    else await shareExportBlob(new Blob([data], { type }), name)
    return
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 60000)
}

export function ExportSheet({ close }) {
  const S = useStore(s => s.S)
  const toast = useUI(s => s.toast)
  const [data, setData] = useState(['workouts'])
  const [period, setPeriod] = useState('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(todayISO())
  const [format, setFormat] = useState('csv')
  const [busy, setBusy] = useState(false)
  const range = periodRange(period, { from, to })
  const counts = useMemo(() => exportCounts(S, range), [S, range.from, range.to])
  const toggle = (id, on) => setData(d => (on ? [...d, id] : d.filter(x => x !== id)))
  const empty = !data.length || data.every(id => (id === 'workouts' ? !counts.workouts : !counts[id]))

  const go = async () => {
    setBusy(true)
    try {
      const file = buildExport(S, { data, period, from, to, format })
      track('data.export')
      await save(file)
      if (!MOBILE) toast(t('Exported'))
      close()
    } catch (e) {
      // A share sheet dismissed is not an error worth a word.
      if (!/cancel/i.test(String(e?.message))) toast(t('Something went wrong'))
    } finally { setBusy(false) }
  }

  return <div className="xp">
    <h3>{t('Export data')}</h3>
    <div className="muted small xp-lead">{t('Choose what to export, from which period and in which format. To keep everything and bring it back into the app, use Export backup instead.')}</div>

    <Section title={t('What')}>
      {DATA.map(d => <Row key={d.id} icon={d.icon} iconTint="var(--blue)" title={d.label()} subtitle={d.count(counts)}>
        <Switch checked={data.includes(d.id)} onChange={v => toggle(d.id, v)} aria-label={d.label()} />
      </Row>)}
    </Section>

    <Section title={t('Period')}>
      <div className="xp-periods">
        {EXPORT_PERIODS.map(p => <button key={p.id} type="button" className={'chip nocap' + (period === p.id ? ' on' : '')} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{PERIOD_LABEL[p.id]()}</button>)}
      </div>
      {period === 'custom' && <div className="xp-dates">
        <label><span>{t('From')}</span><input className="input" type="date" value={from} max={to || todayISO()} onChange={e => setFrom(e.target.value)} /></label>
        <label><span>{t('To')}</span><input className="input" type="date" value={to} min={from || undefined} max={todayISO()} onChange={e => setTo(e.target.value)} /></label>
      </div>}
    </Section>

    <Section title={t('Format')}>
      <div className="xp-format">
        <Segmented value={format} onChange={setFormat} options={[{ value: 'csv', label: 'CSV' }, { value: 'xlsx', label: 'Excel' }, { value: 'json', label: 'JSON' }]} />
        <div className="muted small xp-hint">{FORMAT_HINT[format]()}</div>
      </div>
    </Section>

    <div style={{ height: 6 }} />
    <Button variant="primary" icon="share" disabled={busy || empty} onClick={go}>{empty ? t('Nothing to export in this period') : t('Export')}</Button>
    <div style={{ height: 8 }} />
    <Button onClick={close}>{t('Cancel')}</Button>
  </div>
}

export const exportSheet = () => useUI.getState().openSheet(close => <ExportSheet close={close} />)
