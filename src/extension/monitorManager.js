import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

import * as Main from '@girs/gnome-shell/ui/main';

import {BottomPanel} from '@/extension/components/bottomPanel.js';
import {ThemeManager} from '@/extension/themeManager.js';

export class MonitorManager {
    constructor({dashSource, notificationsMonitor, indicators}) {
        this._panels = [];
        this._dashSource = dashSource;
        this._notificationsMonitor = notificationsMonitor;
        this._indicators = indicators;
        this._themeManager = new ThemeManager();
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => this._rebuildPanels());
        this._rebuildPanels();
        this._shellOverlayKeyId = Number(
            GObject.signal_handler_find(global.display, /** @type {GObject.SignalMatch} */ ({signalId: 'overlay-key'})),
        );
        if (this._shellOverlayKeyId) GObject.signal_handler_block(global.display, this._shellOverlayKeyId);
        this._overlayKeyId = global.display.connect('overlay-key', () => this._onOverlayKey());
    }

    _onOverlayKey() {
        if (!Main.sessionMode.hasOverview) return;
        const active = this._panels.some((panel) => panel._appGrid.appGridActive());
        const modes = Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | (active ? Shell.ActionMode.POPUP : 0);
        if (!(Main.actionMode & modes)) return;
        const [x, y] = global.get_pointer();
        const target = this._panels.find(
            ({_monitor: monitor}) =>
                x >= monitor.x && x < monitor.x + monitor.width && y >= monitor.y && y < monitor.y + monitor.height,
        );
        if (!target) return;
        for (const panel of this._panels) {
            if (panel !== target) panel._appGrid.closeAppGrid();
        }
        if (target._appGrid.appGridActive()) target._appGrid.closeAppGrid();
        else {
            if (Main.overview.visible) Main.overview.hide();
            target._dashSection.closeExpanded();
            target._appGrid.openAppGrid();
        }
    }

    _rebuildPanels() {
        this._destroyPanels();

        for (const monitor of Main.layoutManager.monitors) {
            const panel = new BottomPanel(monitor, {
                dashSource: this._dashSource,
                notificationsMonitor: this._notificationsMonitor,
                indicators: this._indicators,
                themeManager: this._themeManager,
            });
            this._themeManager.addActor(panel);
            this._panels.push(panel);
        }
    }

    setIndicators(indicators) {
        this._indicators = indicators;

        for (const panel of this._panels) panel.setIndicators(indicators);
    }

    _destroyPanels() {
        for (const panel of this._panels) {
            this._themeManager.removeActor(panel);
            panel.destroy();
        }

        this._panels = [];
    }

    destroy() {
        if (this._overlayKeyId) {
            global.display.disconnect(this._overlayKeyId);
            this._overlayKeyId = 0;
        }
        if (this._shellOverlayKeyId) {
            if (GObject.signal_handler_is_connected(global.display, this._shellOverlayKeyId))
                GObject.signal_handler_unblock(global.display, this._shellOverlayKeyId);
            this._shellOverlayKeyId = 0;
        }
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }

        this._destroyPanels();
        this._themeManager.destroy();
        this._themeManager = null;
        this._dashSource = null;
        this._indicators = null;
    }
}
