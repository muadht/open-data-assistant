// Example questions for the start screen (#66). Three are shown at a time, rotating through
// the pool on each page load and "New chat", so they don't repeat until the pool is used up.
// Ordered so that any three in a row cover different topics.
export const EXAMPLE_QUESTIONS = [
  "What's the unemployment rate in Ontario?",
  "How does Ontario's CPI compare with Alberta's?",
  'What is the population of Canada by province?',
  'How has the average hourly wage changed in British Columbia over the last 5 years?',
  "What's the latest price of gasoline in Toronto?",
  'How many housing starts were there in Quebec last year?',
  "How has Canada's real GDP grown since 2015?",
  'What was the median household income in Manitoba?',
  'How many immigrants settled in Alberta last year?',
  'What is the youth unemployment rate in Nova Scotia?',
  'How have new home prices changed in Vancouver?',
  "What's the employment rate for women in Canada?",
  'How have retail sales changed in Saskatchewan this year?',
  'What is the population of Nunavut?',
  'How has the price of groceries changed over the past year?',
] as const

export const EXAMPLES_SHOWN = 3
const STORAGE_KEY = 'open-data-assistant.exampleOffset'

/** The `count` questions starting at `offset`, wrapping round the end of the pool. */
export function examplesAt(offset: number, count = EXAMPLES_SHOWN): string[] {
  const pool = EXAMPLE_QUESTIONS
  return Array.from(
    { length: count },
    (_, i) => pool[(offset + i) % pool.length],
  )
}

/** The next three examples, advancing the stored position so the next page load or new
 * chat shows the following three. Works without storage (private windows, tests): it then
 * starts from the beginning each time. */
export function nextExamples(): string[] {
  let offset = 0
  try {
    offset = Number(localStorage.getItem(STORAGE_KEY)) || 0
    localStorage.setItem(
      STORAGE_KEY,
      String((offset + EXAMPLES_SHOWN) % EXAMPLE_QUESTIONS.length),
    )
  } catch {
    // Storage unavailable - fall back to the first three.
  }
  return examplesAt(offset)
}
