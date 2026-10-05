import { atom, read, update } from 'claude-code'
import type { Register, SessionRateLimit } from 'claude-code'

import type { Meter } from '../types'

/**
 * Everything tunable lives here. Saving this file reloads the mod in a watched
 * session, so a change shows up in the footer within a turn.
 */
const CONFIG = {
  /** Which figures the corner line carries, in this order. */
  show: {
    fiveHour: true,
    sevenDay: false,
    context: true,
    cost: true,
  },
  /** Past this percent of the 5-hour window the line goes yellow and toasts once. */
  warnAt: 80,
  /** Past this percent it goes red and toasts again. */
  alertAt: 95,
  /** How often the countdown is recomputed, in seconds. */
  tickSeconds: 30,
}

const meter = atom({ plugin: 'cc-usage-meter', key: 'meter' } as const, null)
const tick = atom({ plugin: 'cc-usage-meter', key: 'tick' } as const, 0)

const EMPTY: Meter = {
  fiveHourPct: null,
  fiveHourResetsAt: null,
  sevenDayPct: null,
  sevenDayResetsAt: null,
  ctxPct: null,
  costUsd: null,
}

/** 23.5 -> "24%". Figures arrive 0-100 with at most one decimal. */
export function fmtPct(n: number): string {
  return `${Math.round(n)}%`
}

/**
 * How long until `resetsAt`, short enough for the footer: "2h13m", "47m",
 * "<1m", "3d2h". Null when there is no timestamp or it will not parse.
 */
export function fmtRemaining(
  resetsAt: string | null | undefined,
  now: number,
): string | null {
  if (!resetsAt) return null
  const at = Date.parse(resetsAt)
  if (!Number.isFinite(at)) return null

  const minutes = Math.floor((at - now) / 60_000)
  if (minutes <= 0) return 'now'
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours < 24) return restMinutes === 0 ? `${hours}h` : `${hours}h${restMinutes}m`

  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours === 0 ? `${days}d` : `${days}d${restHours}h`
}

/** One window as the corner line writes it: "5h 42% · 2h13m". */
function window_(
  tag: string,
  pct: number | null,
  resetsAt: string | null,
  now: number,
): string | null {
  if (pct === null) return null
  const left = fmtRemaining(resetsAt, now)
  return left === null ? `${tag} ${fmtPct(pct)}` : `${tag} ${fmtPct(pct)} · ${left}`
}

/** The whole corner line, or null when there is nothing worth drawing. */
export function buildLabel(reading: Meter | null, now: number): string | null {
  if (reading === null) return null

  const parts: string[] = []
  if (CONFIG.show.fiveHour) {
    const part = window_('5h', reading.fiveHourPct, reading.fiveHourResetsAt, now)
    if (part !== null) parts.push(part)
  }
  if (CONFIG.show.sevenDay) {
    const part = window_('7d', reading.sevenDayPct, reading.sevenDayResetsAt, now)
    if (part !== null) parts.push(part)
  }
  if (CONFIG.show.context && reading.ctxPct !== null) {
    parts.push(`ctx ${fmtPct(reading.ctxPct)}`)
  }
  if (CONFIG.show.cost && reading.costUsd !== null) {
    parts.push(`$${reading.costUsd.toFixed(2)}`)
  }

  return parts.length === 0 ? null : parts.join('  ')
}

/** 0 below warnAt, 1 past it, 2 past alertAt. */
function bandOf(pct: number | null): 0 | 1 | 2 {
  if (pct === null) return 0
  if (pct >= CONFIG.alertAt) return 2
  if (pct >= CONFIG.warnAt) return 1
  return 0
}

function windowOf(limits: readonly SessionRateLimit[], kind: string) {
  return limits.find(one => one.kind === kind)
}

function readingFrom(
  limits: readonly SessionRateLimit[],
  context: { percent?: number },
  cost: { usd: number } | undefined,
): Meter {
  const five = windowOf(limits, 'five_hour')
  const week = windowOf(limits, 'seven_day')

  return {
    fiveHourPct: five?.percentUsed ?? null,
    fiveHourResetsAt: five?.resetsAt ?? null,
    sevenDayPct: week?.percentUsed ?? null,
    sevenDayResetsAt: week?.resetsAt ?? null,
    ctxPct: context.percent ?? null,
    costUsd: cost?.usd ?? null,
  }
}

/** A ten-cell bar for the `/usage-meter` report. */
function bar(pct: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(pct / 10)))
  return `${'#'.repeat(filled)}${'.'.repeat(10 - filled)}`
}

const WINDOW_NAMES: Record<string, string> = {
  five_hour: '5-hour  ',
  seven_day: 'weekly  ',
  spend_limit: 'spend   ',
}

export const register: Register = on => {
  // Module state: dropped and rebuilt on every reload, unlike the atoms.
  let latest: Meter | null = null
  let lastBand: 0 | 1 | 2 = 0
  let lastDrawn = ''

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-meter',
      description: 'Show the full usage picture: quota windows, context and cost',
    })

    // Seed the line so a resumed session shows figures before its first turn.
    try {
      const usage = await $.session.usage()
      const reading = readingFrom(usage.rateLimits, usage.context, usage.cost)
      latest = reading
      lastBand = bandOf(reading.fiveHourPct)
      await update($, meter, () => reading)
    } catch {
      // No reading available yet; session.measure will bring one.
    }

    // Redraw the countdown, but only when the drawn text would actually change,
    // so a sitting session repaints about once a minute rather than every tick.
    $.clock.every(Math.max(1, CONFIG.tickSeconds) * 1000, () => {
      void (async () => {
        if (latest === null) return
        const label = buildLabel(latest, await $.clock.now())
        if (label === null || label === lastDrawn) return
        lastDrawn = label
        await update($, tick, n => n + 1)
      })()
    })

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const reading = readingFrom(e.rateLimits, e.context, e.cost)
    latest = reading
    lastDrawn = buildLabel(reading, await $.clock.now()) ?? ''
    await update($, meter, () => reading)

    // Toast on crossing a threshold, not on every measurement past it.
    const band = bandOf(reading.fiveHourPct)
    if (band > lastBand && reading.fiveHourPct !== null) {
      const left = fmtRemaining(reading.fiveHourResetsAt, await $.clock.now())
      const tail = left === null ? '' : ` — resets in ${left}`
      $.ui.toast(`${fmtPct(reading.fiveHourPct)} of your 5-hour usage limit${tail}`)
    }
    lastBand = band

    return next(e)
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const reading = await read($, meter)
    // Subscribes this drawing to the ticker, so the countdown moves on its own.
    await read($, tick)

    const label = buildLabel(reading, await $.clock.now())
    if (label === null) return next(e)

    const pct = reading?.fiveHourPct ?? null
    const band = bandOf(pct)

    // Under the threshold, hand the label to the engine as one more mode, so its
    // own labels (focus, memory paused) keep their place and their dim styling.
    if (band === 0) {
      return next({ ...e, props: { ...e.props, modes: [...e.props.modes, label] } })
    }

    // Past it we draw the slot ourselves to colour the number, carrying the
    // engine's modes through so nothing is lost.
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        {e.props.modes.map(mode => (
          <Text dimColor>{mode} & </Text>
        ))}
        <Text color={band === 2 ? 'red' : 'yellow'}>{label}</Text>
      </Box>
    )
  })

  on('command.run', { command: 'usage-meter' }, async $ => {
    const usage = await $.session.usage()
    const now = await $.clock.now()
    const lines: string[] = []

    if (usage.rateLimits.length === 0) {
      lines.push(
        'No quota reading yet. Windows appear after the first API response of',
        'this session, and only on a subscription (never on an API key, Bedrock',
        'or Vertex).',
      )
    } else {
      for (const limit of usage.rateLimits) {
        const name = WINDOW_NAMES[limit.kind] ?? limit.kind
        const left = fmtRemaining(limit.resetsAt, now)
        const tail = left === null ? '' : `  resets in ${left}`
        lines.push(`${name} ${bar(limit.percentUsed)} ${fmtPct(limit.percentUsed)}${tail}`)
      }
    }

    lines.push('')
    if (usage.context.percent !== undefined && usage.context.tokens !== undefined) {
      const k = Math.round(usage.context.tokens / 1000)
      const window = Math.round(usage.context.window / 1000)
      lines.push(`context  ${bar(usage.context.percent)} ${fmtPct(usage.context.percent)}  ${k}k of ${window}k tokens`)
    } else {
      lines.push('context  no reading yet in this window')
    }
    if (usage.cost !== undefined) {
      lines.push(`cost     $${usage.cost.usd.toFixed(2)} this session`)
    }

    return { text: lines.join('\n') }
  })
}
