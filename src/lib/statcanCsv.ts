/** Parse Statistics Canada full-table CSV (quoted fields, UTF-8 BOM on first line). */

export const stripBom = (line: string): string => line.replace(/^\uFEFF/, '')

/** Split a single CSV line with RFC-style quoted fields. */
export const parseCsvLine = (line: string): string[] => {
  const parts: string[] = []
  let cur = ''
  let q = false
  for (let j = 0; j < line.length; j += 1) {
    const c = line[j]
    if (c === '"') {
      q = !q
    } else if (c === ',' && !q) {
      parts.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  parts.push(cur)
  return parts.map((s) => s.replace(/^"|"$/g, ''))
}

export const parseStatCanCsv = (
  text: string,
): {
  headers: string[]
  rows: string[][]
} => {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) {
    return { headers: [], rows: [] }
  }
  const headers = parseCsvLine(stripBom(lines[0]))
  const rows: string[][] = []
  for (let i = 1; i < lines.length; i += 1) {
    rows.push(parseCsvLine(lines[i]))
  }
  return { headers, rows }
}

export const colIndex = (headers: string[], name: string): number => headers.indexOf(name)
