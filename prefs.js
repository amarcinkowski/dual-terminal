import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class DualTerminalPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const page = new Adw.PreferencesPage({
            title: 'Build',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: 'Marker',
        });
        page.add(group);

        const versionRow = new Adw.EntryRow({
            title: 'Version',
            text: 'v0.0.3',
            editable: false,
        });
        group.add(versionRow);
    }
}
