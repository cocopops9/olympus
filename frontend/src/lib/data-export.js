// Olympus: exporting part of your data, chosen in Settings → Data → Export data
// (components/ExportSheet.jsx): which data, over which period, in which format.
//
// The backup (Settings → Back up) is everything, as the app keeps it, to bring back into the app.
// This is for reading elsewhere: a spreadsheet, another app, a coach. So it is tables:
//   workouts      one row per set, laid out like Strong's export, which this app's own importer,
//                 Hevy and most others read back (lib/import-csv.js detectSource says "Strong")
//   bodyweight    one row per weigh-in
//   measurements  one row per day measured, one column per measurement
//   routines      one row per exercise of each routine (a routine has no date: every period has it)
// in three formats:
//   csv           one table per file; more than one table is a .zip of them
//   xlsx          one workbook, a sheet per table (Excel, Numbers, Google Sheets, LibreOffice)
//   json          one file, the chosen data as the app keeps it, for a program to read
//
// Weights are in the profile's unit, as they are stored; measurements in cm, or in inches for a
// profile in lb, as they are shown (lib/measurements.js).
import { zipSync, strToU8 } from 'fflate'
import { exOr } from './exercises.js'
import { modeOf, isTimed } from './history.js'
import { isWarmupRow, setType, isFailureSet } from './workout-model.js'
import { MEASUREMENT_FIELDS, measurementUnit, toMeasurementDisplay } from './measurements.js'

export const EXPORT_DATA = ['workouts', 'bodyweight', 'measurements', 'routines']
export const EXPORT_FORMATS = ['csv', 'xlsx', 'json']
// The periods offered, in days back from today; 'all' and 'custom' are not a number of days.
export const EXPORT_PERIODS = [
  { id: 'week', days: 7 }, { id: 'month', days: 30 }, { id: '3months', days: 91 }, { id: 'year', days: 365 },
  { id: 'all' }, { id: 'custom' },
]

const pad = n => String(n).padStart(2, '0')
/** A local calendar day as YYYY-MM-DD. */
export const dayOf = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

/**
 * The days a period covers, both included, as { from, to } (YYYY-MM-DD; null for no bound).
 * 'week' is today and the six days before it.
 */
export function periodRange(period, { now = Date.now(), from = null, to = null } = {}) {
  if (period === 'all') return { from: null, to: null }
  if (period === 'custom') {
    const a = from || null, b = to || null
    return a && b && a > b ? { from: b, to: a } : { from: a, to: b }
  }
  const p = EXPORT_PERIODS.find(x => x.id === period) || EXPORT_PERIODS[0]
  const start = new Date(now)
  start.setHours(12, 0, 0, 0)
  start.setDate(start.getDate() - (p.days - 1))
  return { from: dayOf(start.getTime()), to: dayOf(now) }
}

const within = (d, { from, to }) => typeof d === 'string' && (!from || d >= from) && (!to || d <= to)

/** What a choice would export, before it is written: { workouts, sets, bodyweight, measurements, routines }. */
export function exportCounts(S, range) {
  const workouts = (S?.workouts || []).filter(w => w && within(w.d, range))
  return {
    workouts: workouts.length,
    sets: workouts.reduce((n, w) => n + (w.entries || []).reduce((m, e) => m + doneSets(e).length, 0), 0),
    bodyweight: (S?.bodyweight || []).filter(b => b && within(b.d, range)).length,
    measurements: (S?.measurements || []).filter(m => m && within(m.d, range)).length,
    routines: (S?.routines || []).length,
  }
}

// The sets that were done: a set left unticked was planned, not lifted.
const doneSets = e => (Array.isArray(e?.sets) ? e.sets : []).filter(s => s && s.done !== false)
const nameOf = (id, S) => (S?.customEx || []).find(c => c.id === id)?.n || exOr(id).n
const round = (n, k = 2) => (Number.isFinite(+n) ? Math.round(+n * 10 ** k) / 10 ** k : '')
const blank = v => (v === 0 || v == null || v === '' ? '' : v)
const timeOf = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }

/** The sets of the workouts in the period, a row each, the oldest workout first. */
export function workoutRows(S, range) {
  const unit = S?.unit === 'lb' ? 'lb' : 'kg'
  const head = ['Date', 'Workout Name', 'Duration (sec)', 'Exercise Name', 'Set Order', 'Set Type',
    unit === 'lb' ? 'Weight (lbs)' : 'Weight (kg)', 'Reps', 'RPE', 'RIR', 'Seconds', 'Distance (km)', 'Incline (%)', 'Notes', 'Workout Notes']
  const rows = [head]
  const list = (S?.workouts || []).filter(w => w && within(w.d, range))
    .sort((a, b) => a.d.localeCompare(b.d) || (a.start || 0) - (b.start || 0))
  for (const w of list) {
    const when = w.d + ' ' + (w.start ? timeOf(w.start) : '00:00:00')
    const duration = w.end > w.start ? Math.round((w.end - w.start) / 1000) : ''
    for (const e of w.entries || []) {
      const cfg = { ...(S?.customEx || []).find(c => c.id === e.id), ...e, id: e.id }
      const mode = modeOf(cfg)
      let order = 0
      for (const s of doneSets(e)) {
        order++
        const warm = isWarmupRow(s)
        const type = warm ? 'Warm Up' : isFailureSet(s) ? 'Failure' : setType(s) === 'dropset' ? 'Drop Set' : 'Normal'
        const cardio = mode === 'cardio' || s.min > 0 || s.speed > 0
        const secs = cardio ? Math.round((Number(s.min) || 0) * 60) : isTimed(cfg) || s.sec > 0 ? Number(s.sec) || 0 : 0
        const km = cardio && s.min > 0 && s.speed > 0 ? round(s.min / 60 * s.speed, 3) : ''
        rows.push([
          when, w.name || '', duration, nameOf(e.id, S), order, type,
          cardio ? '' : blank(round(s.w)), cardio ? '' : blank(s.r), blank(s.rpe), s.rir ?? '', blank(secs), km,
          blank(s.incline), order === 1 ? (e.note || '') : '', w.note || '',
        ])
      }
    }
  }
  return rows
}

export function bodyweightRows(S, range) {
  const unit = S?.unit === 'lb' ? 'lb' : 'kg'
  const rows = [['Date', unit === 'lb' ? 'Weight (lbs)' : 'Weight (kg)']]
  for (const b of (S?.bodyweight || []).filter(b => b && within(b.d, range)).sort((a, b) => a.d.localeCompare(b.d))) rows.push([b.d, round(b.w)])
  return rows
}

export function measurementRows(S, range) {
  const unit = S?.unit === 'lb' ? 'lb' : 'kg'
  const len = measurementUnit(unit)
  const list = (S?.measurements || []).filter(m => m && within(m.d, range)).sort((a, b) => a.d.localeCompare(b.d))
  // Only the measurements somebody took: twenty empty columns say nothing.
  const fields = MEASUREMENT_FIELDS.filter(f => list.some(m => m[f.key] != null))
  const custom = []
  for (const m of list) for (const o of m.other || []) if (o?.value != null && !custom.some(c => c.id === o.id)) custom.push({ id: o.id, name: o.name })
  const rows = [['Date', ...fields.map(f => `${f.label} (${f.kind === 'percent' ? '%' : len})`), ...custom.map(c => c.name)]]
  for (const m of list) {
    rows.push([m.d,
      ...fields.map(f => (m[f.key] == null ? '' : f.kind === 'percent' ? round(m[f.key], 1) : toMeasurementDisplay(m[f.key], unit))),
      ...custom.map(c => (m.other || []).find(o => o.id === c.id)?.value ?? '')])
  }
  return rows
}

export function routineRows(S) {
  const unit = S?.unit === 'lb' ? 'lb' : 'kg'
  const rows = [['Routine', 'Order', 'Exercise Name', 'Sets', 'Reps', unit === 'lb' ? 'Weight (lbs)' : 'Weight (kg)']]
  for (const r of S?.routines || []) {
    (r.ex || []).forEach((x, i) => rows.push([r.name || '', i + 1, nameOf(x.id, S), x.sets ?? '', x.reps ?? '', blank(round(x.weight))]))
  }
  return rows
}

const ROWS = { workouts: workoutRows, bodyweight: bodyweightRows, measurements: measurementRows, routines: routineRows }
// The names of the files and of the sheets, the same in every language so a script can find them.
export const TABLE_NAME = { workouts: 'Workouts', bodyweight: 'Body weight', measurements: 'Measurements', routines: 'Routines' }

/* --------------------------------------------------------------- the formats -- */

const csvCell = v => {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
/** Rows as CSV text, with a byte-order mark so Excel reads the accents right. */
export const toCsv = rows => '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'

const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Characters XML 1.0 does not allow at all, which a pasted note could carry.
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
const column = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s }

/**
 * A workbook of `sheets` ([{ name, rows }]) as .xlsx bytes. An .xlsx is a zip of XML files; this
 * writes the few a workbook needs, with numbers as numbers and text inline, the header row bold
 * and frozen.
 */
export function toXlsx(sheets) {
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`,
  }
  sheets.forEach((s, i) => {
    const body = s.rows.map((r, y) => `<row r="${y + 1}">${r.map((v, x) => {
      const ref = column(x) + (y + 1), style = y === 0 ? ' s="1"' : ''
      if (v === '' || v == null) return ''
      return typeof v === 'number' && Number.isFinite(v)
        ? `<c r="${ref}"${style}><v>${v}</v></c>`
        : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`
    }).join('')}</row>`).join('')
    const widths = (s.rows[0] || []).map((_, x) => Math.min(48, Math.max(8, ...s.rows.slice(0, 200).map(r => String(r[x] ?? '').length + 2))))
    files[`xl/worksheets/sheet${i + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${widths.length ? `<cols>${widths.map((w, x) => `<col min="${x + 1}" max="${x + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''}<sheetData>${body}</sheetData></worksheet>`
  })
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), { level: 6 })
}

/** The chosen data as the app keeps it, for a program to read. */
export function toJson(S, data, range, { now = Date.now() } = {}) {
  const out = { app: 'Olympus', exported: new Date(now).toISOString(), from: range.from, to: range.to, unit: S?.unit === 'lb' ? 'lb' : 'kg' }
  if (data.includes('workouts')) out.workouts = (S?.workouts || []).filter(w => w && within(w.d, range))
  if (data.includes('bodyweight')) out.bodyweight = (S?.bodyweight || []).filter(b => b && within(b.d, range))
  if (data.includes('measurements')) out.measurements = (S?.measurements || []).filter(m => m && within(m.d, range))
  if (data.includes('routines')) out.routines = S?.routines || []
  // The exercises of your own the chosen data names, so the ids in it can be read.
  const ids = new Set([...(out.workouts || []).flatMap(w => (w.entries || []).map(e => e.id)), ...(out.routines || []).flatMap(r => (r.ex || []).map(x => x.id))])
  const custom = (S?.customEx || []).filter(c => ids.has(c.id)).map(({ id, n, bp, eq, mode }) => ({ id, n, bp, eq, mode }))
  if (custom.length) out.customExercises = custom
  return JSON.stringify(out, null, 2)
}

/**
 * The file for a choice: { name, type, data } where data is text or bytes. `data` lists the
 * tables (EXPORT_DATA ids) in the order they are shown.
 */
export function buildExport(S, { data, period = 'month', from = null, to = null, format = 'csv', now = Date.now() }) {
  const chosen = EXPORT_DATA.filter(d => data.includes(d))
  if (!chosen.length) throw new Error('nothing chosen')
  const range = periodRange(period, { now, from, to })
  const stamp = range.from || range.to ? `${range.from || 'start'}_${range.to || dayOf(now)}` : 'all_' + dayOf(now)
  const base = 'olympus-' + (chosen.length === 1 ? chosen[0] : 'data') + '-' + stamp
  if (format === 'json') return { name: base + '.json', type: 'application/json', data: toJson(S, chosen, range, { now }) }
  const tables = chosen.map(d => ({ id: d, name: TABLE_NAME[d], rows: ROWS[d](S, range) }))
  if (format === 'xlsx') return { name: base + '.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: toXlsx(tables) }
  if (tables.length === 1) return { name: base + '.csv', type: 'text/csv', data: toCsv(tables[0].rows) }
  const zip = zipSync(Object.fromEntries(tables.map(tb => [`${tb.name.toLowerCase().replace(/ /g, '-')}.csv`, strToU8(toCsv(tb.rows))])), { level: 6 })
  return { name: base + '.zip', type: 'application/zip', data: zip }
}
