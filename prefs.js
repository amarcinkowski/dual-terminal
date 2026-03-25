import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class DualTerminalPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.dual-terminal');

        // --- General page ---
        const page = new Adw.PreferencesPage({
            title: 'Settings',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        // General group
        const generalGroup = new Adw.PreferencesGroup({
            title: 'General',
        });
        page.add(generalGroup);

        // Terminal application
        const terminalRow = new Adw.EntryRow({
            title: 'Terminal application',
            text: settings.get_string('terminal'),
        });
        terminalRow.connect('changed', () => {
            settings.set_string('terminal', terminalRow.get_text());
        });
        generalGroup.add(terminalRow);

        // Fullscreen toggle
        const fullscreenRow = new Adw.SwitchRow({
            title: 'Fullscreen',
            subtitle: 'Use fullscreen instead of maximized',
        });
        settings.bind('fullscreen', fullscreenRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        generalGroup.add(fullscreenRow);

        // --- Terminal 1 ---
        const t1Group = new Adw.PreferencesGroup({
            title: 'Terminal 1',
        });
        page.add(t1Group);

        const t1MonitorRow = new Adw.SpinRow({
            title: 'Monitor',
            subtitle: 'Monitor index (check Settings → Displays)',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 9,
                step_increment: 1,
            }),
        });
        settings.bind('terminal-1-monitor', t1MonitorRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        t1Group.add(t1MonitorRow);

        const t1CmdRow = new Adw.EntryRow({
            title: 'Command',
            text: settings.get_string('terminal-1-cmd'),
        });
        t1CmdRow.connect('changed', () => {
            settings.set_string('terminal-1-cmd', t1CmdRow.get_text());
        });
        t1Group.add(t1CmdRow);

        // --- Terminal 2 ---
        const t2Group = new Adw.PreferencesGroup({
            title: 'Terminal 2',
        });
        page.add(t2Group);

        const t2MonitorRow = new Adw.SpinRow({
            title: 'Monitor',
            subtitle: 'Monitor index (check Settings → Displays)',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 9,
                step_increment: 1,
            }),
        });
        settings.bind('terminal-2-monitor', t2MonitorRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        t2Group.add(t2MonitorRow);

        const t2CmdRow = new Adw.EntryRow({
            title: 'Command',
            text: settings.get_string('terminal-2-cmd'),
        });
        t2CmdRow.connect('changed', () => {
            settings.set_string('terminal-2-cmd', t2CmdRow.get_text());
        });
        t2Group.add(t2CmdRow);
    }
}
