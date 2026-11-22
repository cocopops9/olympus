// Olympus: a coach's answer as blocks the chat can show on a phone (components/Hercules.jsx Rich).
//
// The models write Markdown, and not always the little of it they are asked for: a technique
// answer came back as a Markdown table whose cells held "<br>"-separated bullets (2026-11-22),
// shown as raw pipes and tags. A table does not fit a phone's width anyway, so it is not drawn as
// a table: each row becomes a heading (its first cell) followed by bullets (the other cells, one
// bullet per line of a cell, labelled with the column's name when there are several columns).
//
// What is understood: headings ("# ", "## ", ..., or a line that is bold and nothing else),
// "- ", "* ", "• " and "1. " lists, tables, "<br>" as a line break, **bold**. Other HTML tags,
// horizontal rules and the marks of *emphasis* and `code` are dropped, keeping their words.
//
// Blocks: { type: 'h', text } | { type: 'p', lines: [text] } | { type: 'ul' | 'ol', items: [text] }.
// The text of a block still holds **bold**, for the renderer to show.

const BULLET = /^\s*(?:[-*•+▪◦]|\d{1,2}[.)])\s+/
const ORDERED = /^\s*\d{1,2}[.)]\s+/
const HEADING = /^\s*#{1,6}\s+/
const RULE = /^\s*(?:[-*_]\s*){3,}$/
const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_SEPARATOR = /^\s*\|?(?:\s*:?-{2,}:?\s*\|)+\s*:?-*:?\s*\|?\s*$/
const BR = /<br\s*\/?>/gi

/** Inline marks other than **bold** taken off, HTML tags gone, spaces tidied. */
function cleanInline(s) {
  return String(s)
    .replace(BR, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/`+([^`]*)`+/g, '$1')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

const cellsOf = row => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
const stripBold = s => s.replace(/^\*\*(.*)\*\*$/, '$1').trim()

/** A cell's lines: split at "<br>" and at line breaks, without their bullet marks. */
const cellLines = cell => cell.split(BR).map(x => cleanInline(x.replace(BULLET, ''))).filter(Boolean)

/** The blocks of one Markdown table (its lines, separator included). */
function tableBlocks(rows) {
  const sepAt = rows.findIndex(r => TABLE_SEPARATOR.test(r))
  const header = sepAt === 1 ? cellsOf(rows[0]).map(c => stripBold(cleanInline(c))) : null
  const body = rows.filter((r, i) => !TABLE_SEPARATOR.test(r) && !(header && i === 0))
  const blocks = []
  for (const row of body) {
    const cells = cellsOf(row)
    const title = stripBold(cleanInline(cells[0] || ''))
    const rest = cells.slice(1)
    const items = []
    rest.forEach((cell, k) => {
      const lines = cellLines(cell)
      // With one column of details its name says nothing the heading does not; with several,
      // each bullet says which column it came from.
      const label = rest.length > 1 && header?.[k + 1] ? header[k + 1] + ': ' : ''
      if (label && lines.length === 1) items.push(label + lines[0])
      else lines.forEach((l, j) => items.push((j === 0 ? label : '') + l))
    })
    if (title && items.length) blocks.push({ type: 'h', text: title }, { type: 'ul', items })
    else if (title) blocks.push({ type: 'p', lines: [title] })
    else if (items.length) blocks.push({ type: 'ul', items })
  }
  return blocks
}

/** The blocks of a coach's answer, in order. */
export function richBlocks(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let para = null, list = null
  const close = () => { para = null; list = null }
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (TABLE_ROW.test(raw)) {
      const rows = []
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(lines[i++])
      i--
      close()
      blocks.push(...tableBlocks(rows))
      continue
    }
    // A "<br>" outside a table is a line break like any other.
    const parts = raw.split(BR)
    for (const part of parts) {
      if (!part.trim()) { if (parts.length === 1) close(); continue }
      if (RULE.test(part)) { close(); continue }
      if (HEADING.test(part)) {
        close()
        const h = stripBold(cleanInline(part.replace(HEADING, '')))
        if (h) blocks.push({ type: 'h', text: h })
        continue
      }
      if (BULLET.test(part)) {
        const type = ORDERED.test(part) ? 'ol' : 'ul'
        const item = cleanInline(part.replace(BULLET, ''))
        if (!item) continue
        if (!list || list.type !== type) { para = null; list = { type, items: [] }; blocks.push(list) }
        list.items.push(item)
        continue
      }
      const line = cleanInline(part)
      if (!line) continue
      // A line that is bold and nothing else, standing alone, reads as a heading.
      if (/^\*\*[^*]+\*\*:?$/.test(line) && !para) {
        close()
        blocks.push({ type: 'h', text: stripBold(line.replace(/:$/, '')) })
        continue
      }
      if (!para) { list = null; para = { type: 'p', lines: [] }; blocks.push(para) }
      para.lines.push(line)
    }
  }
  return blocks
}

/** The text of a block split into plain and **bold** runs: [{ text, bold }]. */
export function inlineRuns(text) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(part => (part.length > 4 && part.startsWith('**') && part.endsWith('**')
    ? { text: part.slice(2, -2), bold: true }
    : { text: part.replace(/\*\*/g, ''), bold: false }))
}
