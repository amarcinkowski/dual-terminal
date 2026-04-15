#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local file="$1"
  local needle="$2"
  grep -Fq "$needle" "$file" || fail "$file missing: $needle"
}

assert_contains "$ROOT/extension.js" 'LaunchOrFocus'
assert_contains "$ROOT/extension.js" 'TerminatorNextPane'
assert_contains "$ROOT/extension.js" 'TerminatorPrevPane'
assert_contains "$ROOT/extension.js" 'TerminatorToggleZoom'
assert_contains "$ROOT/extension.js" 'org.gnome.Shell.Extensions.AiBridgeGnome'
assert_contains "$ROOT/extension.js" 'org.gnome.Shell.Extensions.DualTerminal'
assert_contains "$ROOT/extension.js" 'create_virtual_device'
assert_contains "$ROOT/extension.js" 'Clutter.KEY_Control_L'
assert_contains "$ROOT/extension.js" 'Clutter.KEY_Shift_L'
assert_contains "$ROOT/extension.js" 'Clutter.KEY_n'
assert_contains "$ROOT/extension.js" 'Clutter.KEY_p'
assert_contains "$ROOT/extension.js" 'Clutter.KEY_x'

python3 - <<'PY' "$ROOT"
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
metadata = json.loads((root / "metadata.json").read_text())
assert metadata["uuid"] == "ai-bridge-gnome@kowalski"
assert metadata["name"] == "ai-bridge-gnome"
assert metadata["settings-schema"] == "org.gnome.shell.extensions.ai-bridge-gnome"
assert metadata["version"] == 8

prefs = (root / "prefs.js").read_text()
assert "v0.0.6" in prefs

schema = (root / "schemas/org.gnome.shell.extensions.ai-bridge-gnome.gschema.xml").read_text()
assert 'org.gnome.shell.extensions.ai-bridge-gnome' in schema
assert 'ai-bridge-gnome-launch' in schema

print("OK: smoke-extension")
PY
