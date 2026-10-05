import { test, expect } from 'claude-code/testing'

import {
  bandOf,
  buildLabel,
  fmtPct,
  fmtRemaining,
  orderedWindows,
  worstPct,
} from '../hooks/register'

const NOW = Date.parse('2026-10-05T12:00:00Z')
const iso = (minutesFromNow: number) =>
  new Date(NOW + minutesFromNow * 60_000).toISOString()

/** What this account actually reports: the weekly window and nothing else. */
const WEEKLY_ONLY = {
  windows: [{ kind: 'seven_day', pct: 4, resetsAt: iso(60 * 25 + 46) }],
  ctxPct: 9,
  costUsd: 1.5269544,
}

/** A plan that reports both, handed over in the wrong order on purpose. */
const BOTH = {
  windows: [
    { kind: 'seven_day', pct: 31, resetsAt: iso(60 * 98) },
    { kind: 'five_hour', pct: 42, resetsAt: iso(133) },
  ],
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

test('an account reporting only the weekly window still gets a readout', () => {
  // The regression this guards: pinning the line to five_hour drew no quota at
  // all on a plan that reports seven_day alone.
  expect(buildLabel(WEEKLY_ONLY, NOW)).toBe('7d 4% · 1d1h  ctx 9%  $1.53')
})

test('windows draw in a fixed order however they arrive', () => {
  expect(buildLabel(BOTH, NOW)).toBe('5h 42% · 2h13m  7d 31% · 4d2h  ctx 38%  $1.24')
  expect(orderedWindows(BOTH).map(one => one.kind)).toEqual(['five_hour', 'seven_day'])
})

test('a window kind we have no name for is still drawn', () => {
  const reading = { ...WEEKLY_ONLY, windows: [{ kind: 'mystery', pct: 7, resetsAt: null }] }
  expect(buildLabel(reading, NOW)).toBe('mystery 7%  ctx 9%  $1.53')
})

test('a missing figure drops its part instead of showing a zero', () => {
  expect(buildLabel({ windows: [], ctxPct: 9, costUsd: 1.53 }, NOW)).toBe('ctx 9%  $1.53')
  expect(buildLabel({ ...WEEKLY_ONLY, ctxPct: null }, NOW)).toBe('7d 4% · 1d1h  $1.53')
  expect(
    buildLabel({ ...WEEKLY_ONLY, windows: [{ kind: 'seven_day', pct: 4, resetsAt: null }] }, NOW),
  ).toBe('7d 4%  ctx 9%  $1.53')
})

test('nothing to report draws nothing at all', () => {
  expect(buildLabel(null, NOW)).toBe(null)
  expect(buildLabel({ windows: [], ctxPct: null, costUsd: null }, NOW)).toBe(null)
})

test('the colour follows whichever window is furthest along', () => {
  expect(worstPct(BOTH)).toBe(42)
  expect(worstPct({ windows: [], ctxPct: null, costUsd: null })).toBe(null)
  expect([bandOf(79.9), bandOf(80), bandOf(94), bandOf(95)]).toEqual([0, 1, 1, 2])
  expect(bandOf(null)).toBe(0)
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
    expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()

    await ui.unmount()
  }
})
