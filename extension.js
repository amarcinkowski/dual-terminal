import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
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

// Domyślna konfiguracja uruchamiana przez Super+X
const DEFAULT_CONFIG = {
    terminal: 'ptyxis',
    terminals: [
        { monitor: 1, cmd: 'tmux new-session -A -s left' },
        { monitor: 0, cmd: 'tmux new-session -A -s right' },
    ],
};

export default class DualTerminalExtension {
    _dbus = null;
    _pending = [];
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

        // Rejestruj Super+X
        Main.wm.addKeybinding(
            'dual-terminal-launch',
            this._getKeybindingSettings(),
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._launchDefault()
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
        if (this._settings) {
            this._settings = null;
        }
        this._pending = [];
    }

    _getKeybindingSettings() {
        if (!this._settings) {
            const schema = 'org.gnome.shell.extensions.dual-terminal';
            const schemaSource = Gio.SettingsSchemaSource.new_from_directory(
                GLib.build_filenamev([
                    GLib.get_home_dir(),
                    '.local/share/gnome-shell/extensions/dual-terminal@kowalski/schemas'
                ]),
                Gio.SettingsSchemaSource.get_default(),
                false
            );
            this._settings = new Gio.Settings({
                settings_schema: schemaSource.lookup(schema, true),
            });
        }
        return this._settings;
    }

    _launchDefault() {
        this._launchFromConfig(DEFAULT_CONFIG);
    }

    _launchFromConfig(config) {
        const terminalApp = config.terminal || 'ptyxis';
        const terminals = config.terminals || [];
        if (terminals.length === 0) return;

        this._pending = terminals.map(t => ({
            monitor: t.monitor ?? 0,
            cmd: t.cmd || null,
            terminal: terminalApp,
        }));

        this._spawnNext();
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

        if (this._pending.length > 0) {
            this._spawnNext();
        }
    }

    _spawnNext() {
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

    Launch(configJson) {
        let config;
        try {
            config = JSON.parse(configJson);
        } catch (e) {
            return `error: invalid JSON: ${e.message}`;
        }
        this._launchFromConfig(config);
        return `launching ${(config.terminals || []).length} terminals`;
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
