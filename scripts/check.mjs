/**
 * Runs the mod's pure formatting logic under plain Node, with no engine and no
 * plugin runtime.
 *
 * `claude plugin test` is the real suite, but it refuses to run while the
 * `tengu_plugin_hooks_modules` rollout flag is off, which leaves the logic
 * unexercised on exactly the machines that need the status line instead. This
 * covers the same ground: it lifts everything above `export const register`
 * out of the module (the part with no JSX and no `$`) and asserts against it.
 *
 *   node scripts/check.mjs
 *
 * Needs Node 23.6+ for native TypeScript type stripping.
 */

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'hooks/register.tsx'), 'utf8')

const pure = source
  .split('export const register')[0]
  .split('\n')
  .filter(line => !line.startsWith('import '))
  .join('\n')

const scratch = mkdtempSync(join(tmpdir(), 'cc-usage-meter-'))
const modulePath = join(scratch, 'pure.ts')
writeFileSync(modulePath, `const atom = (ref, initial) => ({ ref, initial })\n${pure}`)

const { buildLabel, fmtPct, fmtRemaining, orderedWindows, worstPct, bandOf } =
  await import(pathToFileURL(modulePath).href)

let failures = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${label}` +
      (ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`),
  )
}

const NOW = Date.parse('2026-10-05T12:00:00Z')
const iso = minutes => new Date(NOW + minutes * 60_000).toISOString()

const WEEKLY_ONLY = {
  windows: [{ kind: 'seven_day', pct: 4, resetsAt: iso(60 * 25 + 46) }],
  ctxPct: 9,
  costUsd: 1.5269544,
}
const BOTH = {
  windows: [
    { kind: 'seven_day', pct: 31, resetsAt: iso(60 * 98) },
    { kind: 'five_hour', pct: 42, resetsAt: iso(133) },
  ],
  ctxPct: 38,
  costUsd: 1.24,
}

is('fmtPct rounds', [fmtPct(42), fmtPct(23.5), fmtPct(0), fmtPct(100)], ['42%', '24%', '0%', '100%'])
is('countdown: hours and minutes', fmtRemaining(iso(133), NOW), '2h13m')
is('countdown: minutes only', fmtRemaining(iso(47), NOW), '47m')
is('countdown: whole hours', fmtRemaining(iso(120), NOW), '2h')
is('countdown: days', fmtRemaining(iso(60 * 74), NOW), '3d2h')
is('countdown: elapsed', fmtRemaining(iso(-5), NOW), 'now')
is(
  'countdown: nothing to count',
  [fmtRemaining(null, NOW), fmtRemaining(undefined, NOW), fmtRemaining('nope', NOW)],
  [null, null, null],
)

is('a weekly-only account still gets a quota readout', buildLabel(WEEKLY_ONLY, NOW), '7d 4% · 1d1h  ctx 9%  $1.53')
is('windows draw in a fixed order however they arrive', buildLabel(BOTH, NOW), '5h 42% · 2h13m  7d 31% · 4d2h  ctx 38%  $1.24')
is('ordering', orderedWindows(BOTH).map(one => one.kind), ['five_hour', 'seven_day'])
is(
  'an unknown window kind is still drawn',
  buildLabel({ ...WEEKLY_ONLY, windows: [{ kind: 'mystery', pct: 7, resetsAt: null }] }, NOW),
  'mystery 7%  ctx 9%  $1.53',
)

is('no windows at all', buildLabel({ windows: [], ctxPct: 9, costUsd: 1.53 }, NOW), 'ctx 9%  $1.53')
is('no context reading', buildLabel({ ...WEEKLY_ONLY, ctxPct: null }, NOW), '7d 4% · 1d1h  $1.53')
is(
  'no resetsAt',
  buildLabel({ ...WEEKLY_ONLY, windows: [{ kind: 'seven_day', pct: 4, resetsAt: null }] }, NOW),
  '7d 4%  ctx 9%  $1.53',
)
is('nothing known at all', [buildLabel(null, NOW), buildLabel({ windows: [], ctxPct: null, costUsd: null }, NOW)], [null, null])

is('worst window wins, whichever kind', worstPct(BOTH), 42)
is('no windows means no band', [worstPct({ windows: [], ctxPct: null, costUsd: null }), bandOf(null)], [null, 0])
is('bands at 80 and 95', [bandOf(79.9), bandOf(80), bandOf(94), bandOf(95), bandOf(100)], [0, 1, 1, 2, 2])

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
