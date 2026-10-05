/**
 * The one reading the meter draws from, as `session.measure` last reported it.
 * Every figure is nullable: the engine leaves one out rather than zeroing it.
 */
export type Meter = {
  /** Percent of the 5-hour window used, 0-100; null before the first reading. */
  fiveHourPct: number | null
  /** ISO 8601 timestamp the 5-hour window resets at. */
  fiveHourResetsAt: string | null
  /** Percent of the 7-day window used, 0-100. */
  sevenDayPct: number | null
  /** ISO 8601 timestamp the 7-day window resets at. */
  sevenDayResetsAt: string | null
  /** Percent of the model's context window filled, 0-100. */
  ctxPct: number | null
  /** What this session has cost so far, in US dollars. */
  costUsd: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'cc-usage-meter': {
      meter: Meter | null
      /** Bumped by the clock so the countdown redraws as it ticks down. */
      tick: number
    }
  }
}
