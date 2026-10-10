// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  EXAMPLE_QUESTIONS,
  EXAMPLES_SHOWN,
  examplesAt,
  nextExamples,
} from './examples'

describe('example questions', () => {
  afterEach(() => localStorage.clear())

  it('rotates through the whole pool before repeating', () => {
    const seen: string[] = []
    const rounds = EXAMPLE_QUESTIONS.length / EXAMPLES_SHOWN
    for (let i = 0; i < rounds; i++) seen.push(...nextExamples())
    expect(new Set(seen).size).toBe(EXAMPLE_QUESTIONS.length)
    // ...and then starts again from the beginning.
    expect(nextExamples()).toEqual(examplesAt(0))
  })

  it('wraps round the end of the pool', () => {
    const last = EXAMPLE_QUESTIONS.length - 1
    expect(examplesAt(last)).toEqual([
      EXAMPLE_QUESTIONS[last],
      EXAMPLE_QUESTIONS[0],
      EXAMPLE_QUESTIONS[1],
    ])
  })

  it('has no duplicate questions', () => {
    expect(new Set(EXAMPLE_QUESTIONS).size).toBe(EXAMPLE_QUESTIONS.length)
  })
})
