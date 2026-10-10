import { describe, expect, it } from 'vitest'
import answerComparison from '../mocks/answer-comparison.sse?raw'
import { answerDetails } from './answerDetails'
import type { AnswerEvent, DataResult } from './events'
import { parseSse } from './sse'

async function terminalAnswer(text: string): Promise<AnswerEvent> {
  let answer: AnswerEvent | undefined
  for await (const m of parseSse(new Response(text).body!)) {
    if (m.event === 'answer') answer = JSON.parse(m.data)
  }
  return answer!
}

describe('answerDetails', () => {
  it('cites each series with the periods the answer used', async () => {
    const [alberta, ontario] = answerDetails(
      await terminalAnswer(answerComparison),
    )
    expect(alberta.name).toBe('Alberta · All-items')
    expect(alberta.vectorId).toBe(41692327)
    expect(alberta.link).toContain('vectorNumbers=v41692327')
    expect(alberta.table.productId).toBe(18100004)
    expect(alberta.periodsUsed).toEqual(['2026-08-01'])
    expect(alberta.releasedOn).toEqual(['2026-09-14'])
    expect(alberta.flags).toEqual([])
    expect(alberta.footnotes[0]).toMatch(/not a cost-of-living index/)
    expect(ontario.name).toBe('Ontario · All-items')
  })

  it('flags suppressed and qualified points the answer used, and links the table when there is no vector', () => {
    const result: DataResult = {
      product_id: 13100778,
      title_en: 'Example table',
      series_title_en: 'Canada;Example',
      members: {},
      footnotes: [],
      coordinate: '1.1.0.0.0.0.0.0.0.0',
      vector_id: null,
      series: [
        point('2026-05-01', 10, 'unreliable', 'preliminary'),
        point('2026-06-01', null, 'too unreliable to be published', null),
      ],
      source_url:
        'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1310077801',
      series_url: null,
      retrieved_at: '2026-10-09T00:00:00Z',
    }
    const [details] = answerDetails({
      message_id: 'm1',
      text: '',
      values: [
        { coordinate: result.coordinate, ref_per: '2026-06-01', value: null },
      ],
      data_results: [result],
    })
    expect(details.name).toBe('Canada;Example')
    expect(details.link).toBe(result.source_url)
    // Only the June point was used, so May's flags aren't attributed to the answer.
    expect(details.flags).toEqual([
      '2026-06-01: no value published',
      '2026-06-01: too unreliable to be published',
    ])
  })
})

function point(
  refPer: string,
  value: number | null,
  status: string,
  symbol: string | null,
) {
  return {
    ref_per: refPer,
    value,
    uom: 'Persons',
    scalar_factor_applied: true,
    status,
    symbol,
    security_level: 'public',
    decimals: 0,
    release_time: '2026-08-15T08:30',
  }
}
