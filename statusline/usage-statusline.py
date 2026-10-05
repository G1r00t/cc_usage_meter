#!/usr/bin/env python3
"""
The same usage readout as the mod, drawn by Claude Code's classic status line.

Claude Code pipes one JSON object in on stdin and prints what we write to
stdout under the prompt input. It trims every line, so this cannot be pushed
to the right-hand edge -- that placement needs the function-hook mod beside
this file.

Fields we read (see README for the full stdin shape):
  rate_limits.five_hour.used_percentage   0-100, one decimal; key absent until
  rate_limits.five_hour.resets_at         the first API response of the process
  rate_limits.seven_day.*                 EPOCH SECONDS, unlike the mod's ISO
  context_window.used_percentage
  cost.total_cost_usd
"""

import json
import sys
import time

# Mirrors CONFIG in hooks/register.tsx.
SHOW = {"five_hour": True, "seven_day": False, "context": True, "cost": True}
WARN_AT = 80
ALERT_AT = 95

DIM = "\033[2m"
YELLOW = "\033[33m"
RED = "\033[31m"
RESET = "\033[0m"


def fmt_pct(value):
    return "%d%%" % round(value)


def fmt_remaining(resets_at, now):
    """Epoch seconds -> '2h13m' / '47m' / '3d2h'. None when there is nothing."""
    if not isinstance(resets_at, (int, float)):
        return None

    minutes = int((resets_at - now) // 60)
    if minutes <= 0:
        return "now"
    if minutes < 60:
        return "%dm" % minutes

    hours, rest_minutes = divmod(minutes, 60)
    if hours < 24:
        return "%dh" % hours if rest_minutes == 0 else "%dh%dm" % (hours, rest_minutes)

    days, rest_hours = divmod(hours, 24)
    return "%dd" % days if rest_hours == 0 else "%dd%dh" % (days, rest_hours)


def window(tag, limit, now):
    if not isinstance(limit, dict):
        return None
    pct = limit.get("used_percentage")
    if not isinstance(pct, (int, float)):
        return None

    left = fmt_remaining(limit.get("resets_at"), now)
    return "%s %s" % (tag, fmt_pct(pct)) if left is None else "%s %s · %s" % (tag, fmt_pct(pct), left)


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    if not isinstance(payload, dict):
        return 0

    now = time.time()
    limits = payload.get("rate_limits") or {}
    context = payload.get("context_window") or {}
    cost = payload.get("cost") or {}

    parts = []
    if SHOW["five_hour"]:
        part = window("5h", limits.get("five_hour"), now)
        if part:
            parts.append(part)
    if SHOW["seven_day"]:
        part = window("7d", limits.get("seven_day"), now)
        if part:
            parts.append(part)
    if SHOW["context"]:
        pct = context.get("used_percentage")
        if isinstance(pct, (int, float)):
            parts.append("ctx %s" % fmt_pct(pct))
    if SHOW["cost"]:
        usd = cost.get("total_cost_usd")
        if isinstance(usd, (int, float)):
            parts.append("$%.2f" % usd)

    if not parts:
        return 0

    five = limits.get("five_hour") or {}
    pct = five.get("used_percentage")
    colour = DIM
    if isinstance(pct, (int, float)):
        if pct >= ALERT_AT:
            colour = RED
        elif pct >= WARN_AT:
            colour = YELLOW

    sys.stdout.write("%s%s%s" % (colour, "  ".join(parts), RESET))
    return 0


if __name__ == "__main__":
    sys.exit(main())
