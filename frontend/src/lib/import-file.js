// Olympus: the bytes of a picked export file as the text the importer parses (sheets.jsx).
/** Olympus: a picked export's text. An Excel workbook (.xlsx, which is a zip, so it starts with
 *  "PK") is read through lib/xlsx.js, loaded only then; anything else is text, decoded the way
 *  FileReader.readAsText did (UTF-8, or UTF-16 when the file starts with that byte-order mark). */
export async function importText(bytes) {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const { readXlsx, rowsToCsv } = await import('./xlsx.js')
    return rowsToCsv(readXlsx(bytes))
  }
  const enc = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8'
  return new TextDecoder(enc).decode(bytes)
}
