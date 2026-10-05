#!/bin/sh
#
# Wires cc-usage-meter into every Claude Code session on this machine, by
# adding two keys to ~/.claude/settings.json:
#
#   statusLine                -- the readout under the prompt (works today)
#   env.CLAUDE_CODE_PLUGIN_DIRS -- the corner mod, once function hooks are on
#
# User settings apply to every session in every directory, so this is a
# one-time step per machine. Safe to re-run: it rewrites only those two keys
# and backs the file up first.
#
#   sh scripts/install.sh
#
set -eu

REPO=$(cd "$(dirname "$0")/.." && pwd)
SETTINGS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"

if ! command -v python3 >/dev/null 2>&1; then
  echo "install: python3 is required (the status line is a python3 script)" >&2
  exit 1
fi

mkdir -p "$(dirname "$SETTINGS")"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"

BACKUP="$SETTINGS.bak.$(date +%Y%m%d%H%M%S)"
cp "$SETTINGS" "$BACKUP"

REPO="$REPO" SETTINGS="$SETTINGS" python3 <<'PY'
import collections, json, os, sys

repo = os.environ['REPO']
path = os.environ['SETTINGS']

try:
    with open(path) as fh:
        settings = json.load(fh, object_pairs_hook=collections.OrderedDict)
except ValueError as err:
    sys.exit('install: %s is not valid JSON (%s); fix it and re-run' % (path, err))

if not isinstance(settings, dict):
    sys.exit('install: %s does not hold a JSON object' % path)

settings['statusLine'] = collections.OrderedDict([
    ('type', 'command'),
    ('command', 'python3 %s/statusline/usage-statusline.py' % repo),
])

env = settings.setdefault('env', collections.OrderedDict())
if not isinstance(env, dict):
    sys.exit('install: settings "env" is not an object; fix it and re-run')
env['CLAUDE_CODE_PLUGIN_DIRS'] = repo

with open(path, 'w') as fh:
    json.dump(settings, fh, indent=2)
    fh.write('\n')
PY

echo "installed into $SETTINGS"
echo "  backup:      $BACKUP"
echo "  status line: python3 $REPO/statusline/usage-statusline.py"
echo "  plugin dir:  $REPO"
echo
echo "The status line shows up in new sessions (and usually the current one)."

FLAG=$(python3 - <<'PY'
import json, os
path = os.path.expanduser('~/.claude.json')
try:
    with open(path) as fh:
        print(json.load(fh).get('cachedGrowthBookFeatures', {}).get('tengu_plugin_hooks_modules'))
except Exception:
    print('unknown')
PY
)
if [ "$FLAG" = "True" ]; then
  echo "Function hooks are ON here: the corner readout loads too."
else
  echo "Function hooks are OFF here (tengu_plugin_hooks_modules=$FLAG), so the"
  echo "corner readout stays dark and the status line does the work. Nothing to"
  echo "fix -- that switch is served remotely."
fi
