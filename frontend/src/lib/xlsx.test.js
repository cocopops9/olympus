// The .xlsx reader: what Hevy and Excel actually write, read back as the rows a CSV would give.
import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { readXlsx, rowsToCsv, serialToText, XlsxError } from './xlsx.js'

// A minimal workbook the way Excel lays one out: the sheet named in workbook.xml through its
// relationship, text in sharedStrings.xml (one entry in rich-text runs), one inline string.
export function workbook(sheetRows, { shared = [], sheetFile = 'sheet1.xml' } = {}) {
  const sst = `<?xml version="1.0"?><sst xmlns="x" count="${shared.length}">${shared.map(s => (Array.isArray(s)
    ? `<si>${s.map(r => `<r><rPr/><t xml:space="preserve">${r}</t></r>`).join('')}<rPh><t>ignored</t></rPh></si>`
    : `<si><t>${s}</t></si>`)).join('')}</sst>`
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Data" sheetId="1" r:id="rId7"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8(`<Relationships><Relationship Id="rId7" Type="ws" Target="worksheets/${sheetFile}"/></Relationships>`),
    'xl/sharedStrings.xml': strToU8(sst),
    [`xl/worksheets/${sheetFile}`]: strToU8(`<worksheet><cols><col min="1" max="3"/></cols><sheetData>${sheetRows}</sheetData></worksheet>`),
    'xl/styles.xml': strToU8('<styleSheet/>'),
  })
}

describe('readXlsx', () => {
  it('reads shared, rich, inline and numeric cells, keeps gaps as empty cells', () => {
    const bytes = workbook(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>reps</t></is></c></row>' +
      '<row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"><v>82.5</v></c><c r="C3" t="b"><v>1</v></c><c r="D3"><v>8</v></c></row>',
      { shared: ['exercise_title', 'weight_kg', ['Press de Banca ', '(Mancuerna) &amp; more']] })
    expect(readXlsx(bytes)).toEqual([
      ['exercise_title', 'weight_kg', '', 'reps'],
      ['Press de Banca (Mancuerna) & more', '82.5', 'TRUE', '8'],
    ])
  })

  it('turns serial numbers in date columns back into dates, and leaves other numbers alone', () => {
    const bytes = workbook(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2"><v>46313.784722222219</v></c><c r="B2"><v>46313</v></c></row>',
      { shared: ['start_time', 'weight_kg'] })
    expect(readXlsx(bytes)[1]).toEqual(['2026-10-18 18:50', '46313'])
    expect(serialToText(45000)).toBe('2023-03-15 00:00')
  })

  it('finds the first sheet by its relationship, whatever the file is called', () => {
    const bytes = workbook('<row r="1"><c r="A1" t="inlineStr"><is><t>title</t></is></c></row>', { sheetFile: 'data.xml' })
    expect(readXlsx(bytes)).toEqual([['title']])
  })

  it('refuses what is not a workbook', () => {
    expect(() => readXlsx(strToU8('title,start_time'))).toThrow(XlsxError)
    expect(() => readXlsx(new Uint8Array([0x50, 0x4b, 1, 2, 3]))).toThrow(XlsxError)
  })

  it('writes CSV that quotes what needs quoting', () => {
    expect(rowsToCsv([['a', 'b,c', 'say "hi"'], ['1', '', 'x\ny']])).toBe('a,"b,c","say ""hi"""\n1,,"x\ny"')
  })
})
