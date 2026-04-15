#!/bin/bash
# ai-workbench.sh — Tilix + tmux ghost + Claude Code
# Wywoływany przez GNOME extension ai-bridge-gnome@kowalski
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
TMUX_CONF="$DIR/tmux-ghost.conf"
BIN_DIR="$DIR/bin"
WORKDIR="${1:-$HOME/git/kowalski}"

PROFILE_MAIN="a47db9c2-568b-4ec5-8308-0a0089a6be4f"
PROFILE_AGENT="360c1d8c-163e-4eac-885c-482c68a64f89"

CMD_MAIN="tmux -f $TMUX_CONF new-session -A -s main -c $WORKDIR \\; send-keys 'claude --name main' Enter"
CMD_AGENT="tmux -f $TMUX_CONF new-session -A -s agent -c $WORKDIR \\; send-keys 'claude --name agent' Enter"

# Uruchom Tilix z lewym panelem (main)
tilix --maximize -w "$WORKDIR" -p "$PROFILE_MAIN" -e "$CMD_MAIN" &
sleep 1

# Dodaj prawy panel (agent) — split vertical
tilix -a session-add-right -w "$WORKDIR" -p "$PROFILE_AGENT" -e "$CMD_AGENT"
