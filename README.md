# cc-usage-meter

A live readout of your Claude usage quota inside Claude Code — how much of the
5-hour window you have spent, when it renews, how full the context window is,
and what the session has cost.

```
  ? for shortcuts                        7d 4% · 1d1h  ctx 9%  $1.53
```

It draws **whichever quota windows your plan actually reports**. Some plans
report the 5-hour window and the weekly one; some report only the weekly one.
Pinning the readout to `five_hour` is how you end up with a line carrying no
quota at all, so both renderers take what they are given and label it.

It ships **two renderers over one set of figures**, because the corner placement
depends on a feature flag that is not on for every account yet:

| | Where it draws | Works today |
|---|---|---|
| `hooks/register.tsx` — the mod | the right corner of the prompt footer | only while function-hook plugins are rolled out to your account |
| `statusline/usage-statusline.py` | a dim line under the input box, left-anchored | always |

Both read the same fields and print the same string, so you can switch between
them without relearning anything.

## Where the numbers come from

Claude Code hands usage figures to extensions directly. There is **no HTTP call,
no token, and no log parsing** in this repo, and there could not be a useful
standalone script either: the quota state lives in a per-process in-memory
singleton and is never written to disk. A tool outside a live session has
nothing to read.

The mod gets them pushed by the `session.measure` event:

```ts
{ context: { tokens?, window, percent? },
  rateLimits: [ { kind: 'five_hour' | 'seven_day' | 'spend_limit',
                  percentUsed /* 0-100 */, resetsAt? /* ISO 8601 */ } ],
  cost?: { usd } }
```

The status line gets the same thing as JSON on stdin:

```jsonc
{ "rate_limits": { "five_hour": { "used_percentage": 42.3,
                                  "resets_at": 1791234567 } },   // epoch SECONDS
  "context_window": { "used_percentage": 38 },
  "cost": { "total_cost_usd": 1.2449 } }
```

**The units differ between the two surfaces** — `resetsAt` is an ISO string for
the mod and epoch seconds for the status line. Do not copy a formula across.

### When the figures are missing

`rate_limits` is absent, and `rateLimits` empty, in three ordinary cases:

- before the first API response of the process,
- on API-key, Bedrock or Vertex auth — the windows are a subscription signal,
- for `context.percent`, right after a compaction, until the next response.

A window your plan does not report is simply not in there. Both renderers drop
the part rather than print a `0%`, and draw nothing at all rather than a line of
placeholders.

## Install

```sh
git clone https://github.com/G1r00t/cc_usage_meter.git
cd cc_usage_meter
sh scripts/install.sh
```

That writes two keys into `~/.claude/settings.json`. Those are **user settings**,
so they apply to every Claude Code session in every directory — one step per
machine, not per project. It backs the file up first and is safe to re-run (say,
after moving the clone). To remove it, delete the `statusLine` key.

Keeping it current is `git pull` in the clone: the status line is a fresh process
on every draw, so it picks up changes with no restart.

The two keys, if you would rather add them by hand:

### The status line (works now)

```json
{
  "statusLine": {
    "type": "command",
    "command": "python3 /ABSOLUTE/PATH/TO/cc_usage_meter/statusline/usage-statusline.py"
  }
}
```

It re-runs on a 300 ms debounce after anything relevant changes, and Claude Code
schedules an extra run for when the nearest reset lands, so the countdown keeps
itself honest. Remove the `statusLine` key to turn it off.

### The mod (for when function hooks are on)

Point `CLAUDE_CODE_PLUGIN_DIRS` at this folder in the `env` block of
`~/.claude/settings.json` (user settings only — a project's are never read):

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/ABSOLUTE/PATH/TO/cc_usage_meter" } }
```

or, for one session, `claude --plugin-dir /ABSOLUTE/PATH/TO/cc_usage_meter`.

Whether your build will load it at all:

```sh
python3 -c "import json;print(json.load(open('$HOME/.claude.json'))['cachedGrowthBookFeatures'].get('tengu_plugin_hooks_modules'))"
```

`True` and it loads. `False` and nothing loads — `claude plugin test` says so
outright (*"hooks modules are turned off in this process"*). That switch is
served remotely; nothing in this repo can change it, and the status line is the
answer until it flips.

## Configure

Both renderers keep their settings in one block near the top of the file —
`CONFIG` in `hooks/register.tsx`, `SHOW` / `WARN_AT` / `ALERT_AT` in
`statusline/usage-statusline.py`. Which figures appear, and the two thresholds
at which the line turns yellow and then red, are all there. Saving the mod
reloads it in a watched session.

## `/usage-meter`

The mod registers a slash command for the fuller picture — both windows with
bars, the context window in tokens, and the session cost.

## Developing

```sh
claude plugin validate .      # reads the manifest and module as the engine will
node scripts/check.mjs        # the formatting logic, no engine needed
claude plugin test .          # the full suite (refused while the flag is off)
tsc -p .                      # once the engine has laid down .claude-plugin/types/
```

The formatting functions are exported from `hooks/register.tsx`, so most of the
behaviour is testable without mounting anything. `scripts/check.mjs` lifts them
out and runs them under plain Node, which matters because `claude plugin test`
refuses to run on exactly the machines where the flag is off.

To see a real status-line payload, point `statusLine.command` at a script that
tees stdin to a file. That is how the weekly-only case above was found — worth
doing before trusting any field name.

## Licence

MIT
# cc_usage_meter
