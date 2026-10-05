/** One quota window as `session.measure` reported it. */
export type MeterWindow = {
  /** `five_hour`, `seven_day`, or a Claude gateway's `spend_limit`. */
  kind: string
  /** How much of the window is used, 0-100. */
  pct: number
  /** ISO 8601 timestamp the window resets at; null when the engine gave none. */
  resetsAt: string | null
}

/**
 * The reading the meter draws from, as `session.measure` last reported it.
 * Figures the engine leaves out stay out: they are never zeroed.
 */
export type Meter = {
  /** Every window the engine reported; empty before the first reading. */
  windows: MeterWindow[]
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
