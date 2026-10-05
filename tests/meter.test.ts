import { test, expect } from 'claude-code/testing'

import { buildLabel, fmtPct, fmtRemaining } from '../hooks/register'

const NOW = Date.parse('2026-10-05T12:00:00Z')
const iso = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000).toISOString()

const READING = {
  fiveHourPct: 42,
  fiveHourResetsAt: iso(133),
  sevenDayPct: 31,
  sevenDayResetsAt: iso(60 * 98),
  ctxPct: 38,
  costUsd: 1.24,
}

test('percentages round to whole numbers', () => {
  expect(fmtPct(42)).toBe('42%')
  expect(fmtPct(23.5)).toBe('24%')
  expect(fmtPct(0)).toBe('0%')
  expect(fmtPct(100)).toBe('100%')
})

test('countdowns stay short enough for the footer', () => {
  expect(fmtRemaining(iso(133), NOW)).toBe('2h13m')
  expect(fmtRemaining(iso(47), NOW)).toBe('47m')
  expect(fmtRemaining(iso(120), NOW)).toBe('2h')
  expect(fmtRemaining(iso(60 * 74), NOW)).toBe('3d2h')
  expect(fmtRemaining(iso(0), NOW)).toBe('now')
  expect(fmtRemaining(iso(-5), NOW)).toBe('now')
})

test('a countdown with nothing to count is left out, never faked', () => {
  expect(fmtRemaining(null, NOW)).toBe(null)
  expect(fmtRemaining(undefined, NOW)).toBe(null)
  expect(fmtRemaining('not a timestamp', NOW)).toBe(null)
})

test('the corner line carries the window, the context and the cost', () => {
  expect(buildLabel(READING, NOW)).toBe('5h 42% · 2h13m  ctx 38%  $1.24')
})

test('a missing figure drops its part instead of showing a zero', () => {
  expect(buildLabel({ ...READING, fiveHourPct: null, fiveHourResetsAt: null }, NOW)).toBe(
    'ctx 38%  $1.24',
  )
  expect(buildLabel({ ...READING, ctxPct: null }, NOW)).toBe('5h 42% · 2h13m  $1.24')
  expect(buildLabel({ ...READING, fiveHourResetsAt: null }, NOW)).toBe(
    '5h 42%  ctx 38%  $1.24',
  )
})

test('nothing to report draws nothing at all', () => {
  expect(buildLabel(null, NOW)).toBe(null)
  expect(
    buildLabel(
      {
        fiveHourPct: null,
        fiveHourResetsAt: null,
        sevenDayPct: null,
        sevenDayResetsAt: null,
        ctxPct: null,
        costUsd: null,
      },
      NOW,
    ),
  ).toBe(null)
})

test('the footer slot keeps the engine modes when there is no reading', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'cc-usage-meter',
      surface,
      component: 'SessionMode',
      props: { modes: ['focus'] },
    })

    expect(await ui.find({ type: 'Text', text: /focus/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /5h/ })).toBeUndefined()

    await ui.unmount()
  }
})
