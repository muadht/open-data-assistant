import { describe, expect, it } from 'vitest'
import {
  coverageYears,
  formatReleaseDate,
  tableNumber,
  tableUrl,
} from './tables'

describe('table formatting', () => {
  it('formats product IDs as StatCan table numbers', () => {
    expect(tableNumber(18100004)).toBe('18-10-0004-01')
    expect(tableNumber(98100001)).toBe('98-10-0001-01')
  })

  it('links to the table page', () => {
    expect(tableUrl(18100004)).toBe(
      'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000401',
    )
  })

  it('shows coverage as a year range', () => {
    expect(coverageYears({ start: '1992-01-01', end: '2026-08-01' })).toBe(
      '1992–2026',
    )
    expect(coverageYears({ start: '2021-01-01', end: '2021-01-01' })).toBe(
      '2021',
    )
  })

  it('formats release dates for reading', () => {
    expect(formatReleaseDate('2026-09-14')).toBe('Sep 14, 2026')
  })
})
