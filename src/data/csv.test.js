import { describe, expect, it } from 'vitest'
import { serializeCsv } from './csv'

describe('CSV exports', () => {
  it('quotes delimiters, quotes, and line breaks', () => {
    const csv = serializeCsv(['Employee name', 'Department'], [['Sample "A"', 'People, Finance'], ['Two\nLines', 'People']])
    expect(csv).toContain('"Sample ""A""","People, Finance"')
    expect(csv).toContain('"Two\nLines","People"')
  })

  it('neutralises formula-like text while preserving numeric values', () => {
    const csv = serializeCsv(['Name', 'Amount'], [['=HYPERLINK("bad")', '+SUM(A1:A2)'], [-250, 1200]])
    expect(csv).toContain('"\'=HYPERLINK(""bad"")","\'+SUM(A1:A2)"')
    expect(csv).toContain('"-250","1200"')
  })
})
