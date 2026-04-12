import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
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
    <method name="LaunchOrFocus">
      <arg type="s" direction="in" name="config_json"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="TerminatorNextPane">
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="TerminatorPrevPane">
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="TerminatorToggleZoom">
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="ListWindows">
      <arg type="s" direction="out" name="result"/>
    </method>
  </interface>
</node>`;

class Keyboard {
    constructor() {
        const seat = Clutter.get_default_backend().get_default_seat();
        this._device = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    }

    destroy() {
        this._device.run_dispose();
    }

    _notify(key, state) {
        this._device.notify_keyval(
            Clutter.get_current_event_time() * 1000,
            key,
            state
        );
    }

    press(key) {
        this._notify(key, Clutter.KeyState.PRESSED);
    }

    release(key) {
        this._notify(key, Clutter.KeyState.RELEASED);
    }
}

export default class DualTerminalExtension extends Extension {
    _dbus = null;
    _pending = [];
    _defaultTracked = [];
    _singletonWindows = new Map();
    _settings = null;
    _keyboard = null;

    enable() {
        this._keyboard = new Keyboard();
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
        if (this._keyboard) {
            this._keyboard.destroy();
            this._keyboard = null;
        }
        this._settings = null;
        this._pending = [];
        this._defaultTracked = [];
        this._singletonWindows.clear();
    }

    _getKeybindingSettings() {
        if (!this._settings)
            this._settings = this.getSettings('org.gnome.shell.extensions.dual-terminal');
        return this._settings;
    }

    _isLiveWindow(win) {
        try {
            return !!win && win.get_wm_class() !== null;
        } catch (e) {
            return false;
        }
    }

    _pruneDefaultTracked() {
        this._defaultTracked = this._defaultTracked.filter(w => this._isLiveWindow(w));
    }

    _pruneSingletons() {
        const liveWindows = new Set(
            global.get_window_actors()
                .map(actor => actor.meta_window)
                .filter(win => this._isLiveWindow(win))
        );

        for (const [key, win] of this._singletonWindows.entries()) {
            if (!this._isLiveWindow(win) || !liveWindows.has(win))
                this._singletonWindows.delete(key);
        }
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
            for (const w of wins)
                w.minimize();
        } else {
            const now = global.get_current_time();
            for (const w of wins) {
                w.unminimize();
                w.activate(now);
            }
            if (wins.length > 0)
                wins[0].activate(now);
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
                separate: true,
                fullscreen: settings.get_boolean('fullscreen'),
                source: 'default',
            });
        }

        if (cmd2) {
            this._pending.push({
                monitor: settings.get_int('terminal-2-monitor'),
                cmd: cmd2,
                terminal: terminalApp,
                separate: true,
                fullscreen: settings.get_boolean('fullscreen'),
                source: 'default',
            });
        }

        if (this._pending.length > 0)
            this._spawnTask();
    }

    _findMatchingWindow({id, matchTitle, matchWmClass}) {
        const windows = global.get_window_actors()
            .map(actor => actor.meta_window)
            .filter(win => this._isLiveWindow(win));
        const liveWindowSet = new Set(windows);

        for (const [key, win] of this._singletonWindows.entries()) {
            if (!liveWindowSet.has(win))
                this._singletonWindows.delete(key);
        }

        if (id && this._singletonWindows.has(id))
            return this._singletonWindows.get(id);

        const titleNeedle = matchTitle || null;
        const classNeedle = matchWmClass ? matchWmClass.toLowerCase() : null;

        const found = windows.find(win => {
            const title = win.get_title() || '';
            const wmClass = (win.get_wm_class() || '').toLowerCase();

            if (titleNeedle && title === titleNeedle)
                return true;
            if (classNeedle && wmClass === classNeedle)
                return true;
            return false;
        }) || null;

        if (found && id)
            this._singletonWindows.set(id, found);

        return found;
    }

    _focusWindow(win, monitor, fullscreen) {
        const now = global.get_current_time();
        if (win.minimized)
            win.unminimize();
        win.activate(now);
        return `focused existing window \"${win.get_title()}\"`;
    }

    _focusAndRun(matchWmClass, matchTitle, callback) {
        const win = this._focusMatchingWindow(matchWmClass, matchTitle) ||
            this._focusMatchingWindow(matchWmClass);
        if (!win)
            return false;

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            callback();
            return GLib.SOURCE_REMOVE;
        });
        return true;
    }

    _focusMatchingWindow(matchWmClass, matchTitle = null) {
        const windows = global.get_window_actors()
            .map(actor => actor.meta_window)
            .filter(win => this._isLiveWindow(win));

        const found = windows.find(win => {
            const title = win.get_title() || '';
            const wmClass = (win.get_wm_class() || '').toLowerCase();
            if (matchTitle && title === matchTitle)
                return true;
            return wmClass === matchWmClass.toLowerCase();
        }) || null;

        if (!found)
            return null;

        const now = global.get_current_time();
        if (found.minimized)
            found.unminimize();
        found.activate(now);
        return found;
    }

    _pressAccelerator(keys) {
        if (!this._keyboard)
            return 'keyboard unavailable';

        for (const key of keys.slice(0, -1))
            this._keyboard.press(key);

        const last = keys[keys.length - 1];
        this._keyboard.press(last);
        this._keyboard.release(last);

        for (const key of keys.slice(0, -1).reverse())
            this._keyboard.release(key);

        return 'ok';
    }

    _spawnArgv(task) {
        if (Array.isArray(task.argv) && task.argv.length > 0)
            return task.argv;

        const argv = [task.terminal || 'ptyxis'];
        if (task.separate !== false)
            argv.push('-s');
        if (task.cmd)
            argv.push('-x', task.cmd);
        return argv;
    }

    _onWindowCreated(win) {
        if (this._pending.length === 0)
            return;

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
        if (this._pending.length === 0)
            return;

        const task = this._pending.shift();

        if (task.source === 'default')
            this._defaultTracked.push(win);
        if (task.source === 'singleton' && task.singletonId)
            this._singletonWindows.set(task.singletonId, win);

        if (this._pending.length > 0)
            this._spawnTask();
    }

    _spawnTask() {
        const task = this._pending[0];
        if (!task)
            return;

        const argv = this._spawnArgv(task);

        try {
            GLib.spawn_async(
                null,
                argv,
                null,
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

        const settings = this._getKeybindingSettings();
        const terminalApp = config.terminal || 'ptyxis';
        const terminals = config.terminals || [];
        if (terminals.length === 0)
            return 'error: no terminals defined';

        this._pending = terminals.map(t => ({
            monitor: t.monitor ?? 0,
            cmd: t.cmd || null,
            argv: Array.isArray(t.argv) ? t.argv : null,
            terminal: t.terminal || terminalApp,
            separate: t.separate ?? true,
            fullscreen: t.fullscreen ?? config.fullscreen ?? settings.get_boolean('fullscreen'),
            source: 'dbus',
            singletonId: t.singleton_id || null,
        }));

        this._spawnTask();
        return `launching ${terminals.length} terminals`;
    }

    LaunchOrFocus(configJson) {
        let config;
        try {
            config = JSON.parse(configJson);
        } catch (e) {
            return `error: invalid JSON: ${e.message}`;
        }

        const settings = this._getKeybindingSettings();
        const id = config.id || null;
        const monitor = config.monitor ?? 0;
        const fullscreen = config.fullscreen ?? settings.get_boolean('fullscreen');
        const matchTitle = config.match_title || config.title || null;
        const matchWmClass = config.match_wm_class || null;

        const existing = this._findMatchingWindow({id, matchTitle, matchWmClass});
        if (existing)
            return this._focusWindow(existing, monitor, fullscreen);

        this._pending = [{
            monitor,
            cmd: config.cmd || null,
            argv: Array.isArray(config.argv) ? config.argv : null,
            terminal: config.terminal || 'ptyxis',
            separate: config.separate ?? true,
            fullscreen,
            source: 'singleton',
            singletonId: id,
        }];

        this._spawnTask();
        return `launching singleton ${id || matchTitle || matchWmClass || 'window'}`;
    }

    TerminatorNextPane() {
        if (!this._focusAndRun('terminator', 'AI Terminator', () => {
            this._pressAccelerator([
                Clutter.KEY_Control_L,
                Clutter.KEY_Shift_L,
                Clutter.KEY_n,
            ]);
        }))
            return 'no terminator window';
        return 'queued Ctrl+Shift+N';
    }

    TerminatorPrevPane() {
        if (!this._focusAndRun('terminator', 'AI Terminator', () => {
            this._pressAccelerator([
                Clutter.KEY_Control_L,
                Clutter.KEY_Shift_L,
                Clutter.KEY_p,
            ]);
        }))
            return 'no terminator window';
        return 'queued Ctrl+Shift+P';
    }

    TerminatorToggleZoom() {
        if (!this._focusAndRun('terminator', 'AI Terminator', () => {
            this._pressAccelerator([
                Clutter.KEY_Control_L,
                Clutter.KEY_Shift_L,
                Clutter.KEY_x,
            ]);
        }))
            return 'no terminator window';
        return 'queued Ctrl+Shift+X';
    }

    MoveToMonitor(monitorIndex, fullscreen) {
        const win = global.display.get_focus_window();
        if (!win)
            return 'no focused window';

        const nMonitors = global.display.get_n_monitors();
        if (monitorIndex < 0 || monitorIndex >= nMonitors)
            return `invalid monitor ${monitorIndex}, have ${nMonitors}`;

        win.move_to_monitor(monitorIndex);
        if (fullscreen)
            win.make_fullscreen();

        return `moved \"${win.get_title()}\" to monitor ${monitorIndex}`;
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
