# ai-bridge-gnome — GNOME Shell Extension

GNOME Shell extension for controlling the `Bridge` AI workbench on GNOME Wayland.

This project is currently still stored in the repository and runtime paths named `dual-terminal`, but the user-facing system name is now `ai-bridge-gnome`.

Compatibility note:

- GNOME extension UUID is still `dual-terminal@kowalski`
- settings schema is still `org.gnome.shell.extensions.dual-terminal`
- DBus interface is still `org.gnome.Shell.Extensions.DualTerminal`

Those identifiers stay unchanged for now to avoid breaking the working `Bridge` setup.

## Why?

On GNOME 49+ Wayland, there is no straightforward way to launch a window on a chosen monitor from a script. None of the usual tools work:

| Tool | Issue |
|------|-------|
| `ydotool` | uinput keypresses don't reach GNOME Shell compositor |
| `wtype` | GNOME/Mutter doesn't support `virtual-keyboard` protocol (wlroots only) |
| `wmctrl` | doesn't work on Wayland |
| `xdotool` | doesn't work on Wayland |
| `org.gnome.Shell.Eval` | disabled since GNOME 45+ |

This extension solves it by using the Mutter API directly from within GNOME Shell.

In the current setup its primary role is no longer “two terminals”. It exists mainly to:

- launch or focus the main `Bridge` window
- route `Bridge` fallback windows (`Bridge CODEX`, `Bridge CLAUDE`, `Bridge GEMMA`)
- move freshly launched `Bridge` windows to the desired monitor
- provide DBus control hooks for `OpenDeck`

## Installation

```bash
# Clone the repo
git clone https://github.com/amarcinkowski/dual-terminal.git

# Copy to GNOME Shell extensions directory
cp -r dual-terminal ~/.local/share/gnome-shell/extensions/dual-terminal@kowalski

# Compile the GSettings schema
glib-compile-schemas \
  ~/.local/share/gnome-shell/extensions/dual-terminal@kowalski/schemas/

# Log out and log back in (GNOME Shell needs to discover the new extension)

# Enable the extension
gnome-extensions enable dual-terminal@kowalski
```

## Usage

### Keyboard shortcut

**`Super+X`** launches the default configuration:

- Two [Ptyxis](https://gitlab.gnome.org/chergert/ptyxis) terminal windows, each maximized on a separate monitor
- Each window attaches to a named tmux session (`left` / `right`)
- The sessions are visually distinct via tmux status bar colors and labels

Pressing `Super+X` again hides or restores only the windows from that default layout. DBus-launched windows are not included in the toggle set.

### DBus API

The extension currently exposes `org.gnome.Shell.Extensions.DualTerminal` on the session bus.

**Launch** — spawn terminals with a custom configuration:

```bash
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DualTerminal \
  --method org.gnome.Shell.Extensions.DualTerminal.Launch \
  '{"terminal":"ptyxis","terminals":[
    {"monitor":1,"cmd":"tmux new-session -A -s work"},
    {"monitor":0,"cmd":"tmux new-session -A -s chat"}
  ]}'
```

**MoveToMonitor** — move the focused window to a monitor:

```bash
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DualTerminal \
  --method org.gnome.Shell.Extensions.DualTerminal.MoveToMonitor 1 true
```

Parameters: `monitor_index` (int), `fullscreen` (bool).

**ListWindows** — list all windows with their monitor assignments:

```bash
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DualTerminal \
  --method org.gnome.Shell.Extensions.DualTerminal.ListWindows
```

## Configuration

### Default layout

The default layout is configured via GSettings schema keys:

```bash
gsettings --schemadir ~/.local/share/gnome-shell/extensions/dual-terminal@kowalski/schemas \
  get org.gnome.shell.extensions.dual-terminal terminal-1-cmd

gsettings --schemadir ~/.local/share/gnome-shell/extensions/dual-terminal@kowalski/schemas \
  get org.gnome.shell.extensions.dual-terminal terminal-2-cmd
```

### Keybinding

The default shortcut is `Super+X`. Change it via GSettings:

```bash
gsettings --schemadir ~/.local/share/gnome-shell/extensions/dual-terminal@kowalski/schemas \
  set org.gnome.shell.extensions.dual-terminal dual-terminal-launch "['<Super>z']"
```

### Fullscreen

By default terminals are **maximized**. To use fullscreen instead:

```bash
gsettings --schemadir ~/.local/share/gnome-shell/extensions/dual-terminal@kowalski/schemas \
  set org.gnome.shell.extensions.dual-terminal fullscreen true
```

## How it works

1. `enable()` registers the `Super+X` keybinding and listens for `window-created` signals
2. On keypress (or DBus `Launch` call), a queue of terminals is created
3. The first terminal is spawned (`ptyxis -s -x "tmux ..."`)
4. When GNOME Shell emits `window-created`, the extension moves the new window to the target monitor and then maximizes it or makes it fullscreen, depending on settings
5. If more terminals are queued, the next one is spawned
6. Sequential spawning eliminates race conditions — no `sleep` hacks needed

## Requirements

- GNOME Shell 45+ (tested on 49, Wayland)
- [Ptyxis](https://gitlab.gnome.org/chergert/ptyxis) terminal (or any terminal supporting `-s` for separate instance and `-x` for command execution)
- tmux

## Bridge context

The current `Bridge` workbench uses this extension together with:

- `Terminator` as frontend
- `tmux` as persistent backend
- `OpenDeck` as hardware input layer

The long-term direction is to treat this extension as the `ai-bridge-gnome` orchestration layer for that stack.

## License

MIT
