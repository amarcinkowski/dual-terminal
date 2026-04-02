#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="dual-terminal@kowalski"

glib-compile-schemas "$ROOT_DIR/schemas"
gnome-extensions disable "$UUID" >/dev/null 2>&1 || true
gnome-extensions enable "$UUID"

printf 'Reloaded %s from %s\n' "$UUID" "$ROOT_DIR"
