import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const IFACE = `
<node>
  <interface name="org.gnome.Shell.Extensions.DualTerminal">
    <method name="MoveToMonitor">
      <arg type="i" direction="in" name="monitor"/>
      <arg type="b" direction="in" name="fullscreen"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="Launch">
      <arg type="s" direction="in" name="config_json"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="ListWindows">
      <arg type="s" direction="out" name="result"/>
    </method>
  </interface>
</node>`;

export default class DualTerminalExtension extends Extension {
    _dbus = null;
    _pending = [];
    _defaultTracked = [];
    _settings = null;

    enable() {
        this._dbus = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
        this._dbus.export(
            Gio.DBus.session,
            '/org/gnome/Shell/Extensions/DualTerminal'
        );

        this._windowAddedId = global.display.connect(
            'window-created', (_display, win) => this._onWindowCreated(win)
        );

        Main.wm.addKeybinding(
            'dual-terminal-launch',
            this._getKeybindingSettings(),
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._toggleDefault()
        );
    }

    disable() {
        Main.wm.removeKeybinding('dual-terminal-launch');

        if (this._windowAddedId) {
            global.display.disconnect(this._windowAddedId);
            this._windowAddedId = null;
        }
        if (this._dbus) {
            this._dbus.unexport();
            this._dbus = null;
        }
        this._settings = null;
        this._pending = [];
        this._defaultTracked = [];
    }

    _getKeybindingSettings() {
        if (!this._settings) {
            this._settings = this.getSettings('org.gnome.shell.extensions.dual-terminal');
        }
        return this._settings;
    }

    _pruneDefaultTracked() {
        this._defaultTracked = this._defaultTracked.filter(w => {
            try {
                return w.get_wm_class() !== null;
            } catch (e) {
                return false;
            }
        });
    }

    _getLiveDefaultWindows() {
        this._pruneDefaultTracked();
        return this._defaultTracked;
    }

    _toggleDefault() {
        const wins = this._getLiveDefaultWindows();

        if (wins.length === 0) {
            this._launchDefault();
            return;
        }

        const hasVisible = wins.some(w => !w.minimized);

        if (hasVisible) {
            for (const w of wins) w.minimize();
        } else {
            const now = global.get_current_time();
            for (const w of wins) {
                w.unminimize();
                w.activate(now);
            }
            if (wins.length > 0) wins[0].activate(now);
        }
    }

    _launchDefault() {
        const settings = this._getKeybindingSettings();
        const terminalApp = settings.get_string('terminal') || 'ptyxis';
        const cmd1 = settings.get_string('terminal-1-cmd') || '';
        const cmd2 = settings.get_string('terminal-2-cmd') || '';

        this._pending = [];

        if (cmd1) {
            this._pending.push({
                monitor: settings.get_int('terminal-1-monitor'),
                cmd: cmd1,
                terminal: terminalApp,
                source: 'default',
            });
        }

        if (cmd2) {
            this._pending.push({
                monitor: settings.get_int('terminal-2-monitor'),
                cmd: cmd2,
                terminal: terminalApp,
                source: 'default',
            });
        }

        if (this._pending.length > 0)
            this._spawnTerminal();
    }

    _onWindowCreated(win) {
        if (this._pending.length === 0) return;

        const id = win.connect('notify::wm-class', () => {
            win.disconnect(id);
            this._assignWindow(win);
        });

        if (win.get_wm_class()) {
            win.disconnect(id);
            this._assignWindow(win);
        }
    }

    _assignWindow(win) {
        if (this._pending.length === 0) return;

        const task = this._pending.shift();
        const nMonitors = global.display.get_n_monitors();

        if (task.monitor >= 0 && task.monitor < nMonitors) {
            win.move_to_monitor(task.monitor);
        }

        const settings = this._getKeybindingSettings();
        if (settings.get_boolean('fullscreen'))
            win.make_fullscreen();
        else
            win.maximize(Meta.MaximizeFlags.BOTH);

        if (task.source === 'default')
            this._defaultTracked.push(win);

        if (this._pending.length > 0) {
            this._spawnTerminal();
        }
    }

    _spawnTerminal() {
        const task = this._pending[0];
        if (!task) return;

        const argv = [task.terminal, '-s'];
        if (task.cmd) {
            argv.push('-x', task.cmd);
        }

        try {
            GLib.spawn_async(
                null, argv, null,
                GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
                null
            );
        } catch (e) {
            this._pending.shift();
            log(`[DualTerminal] spawn error: ${e.message}`);
        }
    }

    // --- DBus methods ---

    Launch(configJson) {
        let config;
        try {
            config = JSON.parse(configJson);
        } catch (e) {
            return `error: invalid JSON: ${e.message}`;
        }

        const terminalApp = config.terminal || 'ptyxis';
        const terminals = config.terminals || [];
        if (terminals.length === 0)
            return 'error: no terminals defined';

        this._pending = terminals.map(t => ({
            monitor: t.monitor ?? 0,
            cmd: t.cmd || null,
            terminal: terminalApp,
            source: 'dbus',
        }));

        this._spawnTerminal();
        return `launching ${terminals.length} terminals`;
    }

    MoveToMonitor(monitorIndex, fullscreen) {
        const win = global.display.get_focus_window();
        if (!win) return 'no focused window';

        const nMonitors = global.display.get_n_monitors();
        if (monitorIndex < 0 || monitorIndex >= nMonitors)
            return `invalid monitor ${monitorIndex}, have ${nMonitors}`;

        win.move_to_monitor(monitorIndex);
        if (fullscreen) win.make_fullscreen();

        return `moved "${win.get_title()}" to monitor ${monitorIndex}`;
    }

    ListWindows() {
        const wins = global.get_window_actors().map(a => {
            const w = a.meta_window;
            return {
                title: w.get_title(),
                wm_class: w.get_wm_class(),
                monitor: w.get_monitor(),
            };
        });
        return JSON.stringify(wins);
    }
}
