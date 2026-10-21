// Olympus: the first sheet of an Excel workbook (.xlsx) as rows of strings, for the importer.
//
// Hevy's export, and any history someone opened and saved again in Excel or Google Sheets, can
// arrive as .xlsx instead of .csv. An .xlsx is a zip of XML files: the workbook says which sheet
// comes first, the sheet holds the cells, and text cells point into a shared list of strings.
// Only that much is read here. fflate inflates the zip (the app's own zip.js reads only the
// uncompressed backups it writes), and the XML is read with plain string scanning rather than a
// DOM, so the same code runs in the WebView and in the tests.
//
// Dates: a sheet saved by Excel may hold a date as a number of days since 1899-12-30, with only
// the cell's style saying it is a date. Styles are not read; instead a number in a column whose
// header names a date or a time is turned back into "YYYY-MM-DD HH:MM", which parseWhen reads.
import { unzipSync, strFromU8 } from 'fflate'

export class XlsxError extends Error {
  constructor(code) { super(code); this.code = code }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') {
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return Number.isFinite(n) ? String.fromCodePoint(n) : m
  }
  return ENTITIES[e.toLowerCase()] ?? m
})

// Every <t>…</t> inside a fragment, joined: a rich-text string is split into runs, each with its
// own <t>. Phonetic hints (<rPh>, East Asian readings) are not part of the text.
const textOf = xml => {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  let out = ''
  for (const m of clean.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) out += m[1] ? decode(m[1]) : ''
  return out
}

const attr = (tag, name) => {
  const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag)
  return m ? decode(m[1]) : null
}

// "C12" -> 2 (zero-based column).
const colOf = ref => {
  const letters = /^[A-Z]+/i.exec(ref || '')?.[0]?.toUpperCase() || ''
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

const p2 = n => String(n).padStart(2, '0')
/** Excel's serial day number (1900 date system) -> "YYYY-MM-DD HH:MM", in the sheet's own clock. */
export function serialToText(serial) {
  const ms = Math.round((Number(serial) - 25569) * 86400000)   // 25569 = days from 1899-12-30 to 1970-01-01
  const d = new Date(ms)
  if (!Number.isFinite(d.getTime())) return String(serial)
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`
}

const LIMITS = { files: 400, bytes: 200 * 1024 * 1024, rows: 300000 }

/** The first worksheet of an .xlsx (Uint8Array or ArrayBuffer) as an array of rows of strings. */
export function readXlsx(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new XlsxError('not-xlsx')
  let files
  let total = 0
  try {
    files = unzipSync(bytes, {
      filter: f => {
        // Only the parts that hold the data; drawings, images and styles are left packed.
        if (!/^(xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/worksheets\/[^/]+\.xml)$/i.test(f.name)) return false
        total += f.originalSize
        if (total > LIMITS.bytes) throw new XlsxError('too-large')
        return true
      },
    })
  } catch (e) {
    if (e instanceof XlsxError) throw e
    throw new XlsxError('bad-zip')
  }
  const text = name => {
    const key = Object.keys(files).find(k => k.toLowerCase() === name.toLowerCase())
    return key ? strFromU8(files[key]) : null
  }

  // Which file is the first sheet: workbook.xml lists the sheets in order, by relationship id.
  let sheetPath = null
  const workbook = text('xl/workbook.xml')
  const rels = text('xl/_rels/workbook.xml.rels')
  if (workbook && rels) {
    const first = /<sheet\b[^>]*>/.exec(workbook)?.[0]
    const rid = first && (attr(first, 'r:id') || attr(first, 'id'))
    const rel = rid && [...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(r => attr(r, 'Id') === rid)
    const target = rel && attr(rel, 'Target')
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '')
  }
  const sheets = Object.keys(files).filter(k => /^xl\/worksheets\/[^/]+\.xml$/i.test(k)).sort()
  const sheetXml = (sheetPath && text(sheetPath)) || (sheets[0] && text(sheets[0]))
  if (!sheetXml) throw new XlsxError('no-sheet')

  const shared = []
  const sst = text('xl/sharedStrings.xml')
  if (sst) for (const m of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) shared.push(m[1] ? textOf(m[1]) : '')

  const rows = []
  for (const rm of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)) {
    if (rows.length >= LIMITS.rows) throw new XlsxError('too-large')
    const at = Number(attr(' ' + (rm[1] || ''), 'r'))
    const row = []
    let next = 0
    for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = ' ' + cm[1]
      const ref = attr(tag, 'r')
      const col = ref ? colOf(ref) : next
      next = col + 1
      const type = attr(tag, 't')
      const body = cm[2] || ''
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
      let value = ''
      if (type === 's') value = shared[Number(v)] ?? ''
      else if (type === 'inlineStr') value = textOf(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] || '')
      else if (type === 'b') value = v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : ''
      else if (v != null) value = decode(v)
      row[col] = value
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = ''
    // A row number that skips ahead leaves empty rows in between; they carry nothing.
    if (Number.isFinite(at) && at > 0) rows[at - 1] = row
    else rows.push(row)
  }
  const out = rows.filter(r => r && r.some(x => String(x).trim() !== ''))

  // Date columns written as serial numbers (see the header comment).
  const head = (out[0] || []).map(h => String(h).toLowerCase())
  const dateCols = head.map((h, i) => (/date|time|fecha|data|datum|start|end|inizio|fine/.test(h) ? i : -1)).filter(i => i >= 0)
  for (let r = 1; r < out.length; r++) {
    for (const i of dateCols) {
      const s = out[r][i]
      if (/^\d{4,5}(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) out[r][i] = serialToText(s)
    }
  }
  return out
}

const csvCell = v => {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
/** The rows as CSV text, the shape parseImport reads. */
export const rowsToCsv = rows => rows.map(r => r.map(csvCell).join(',')).join('\n')

/** True when the bytes start like a zip (an .xlsx is one). */
export const looksLikeXlsx = (bytes, name = '') => /\.xlsx$/i.test(name) || (bytes?.[0] === 0x50 && bytes?.[1] === 0x4b)
