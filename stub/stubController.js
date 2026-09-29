import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import {
    DashPopulationTab,
    MIN_DASH_ITEMS,
} from './dashPopulationTab.js';
import {
    IndicatorPopulationTab,
    MIN_INDICATORS,
} from './indicatorPopulationTab.js';
import {createMockDashApps} from './mockDashApps.js';
import {createMockIndicators} from './mockIndicators.js';

export class StubController {
    constructor({onDashAppsChanged, onIndicatorsChanged}) {
        this._dashItemCount = MIN_DASH_ITEMS;
        this._indicatorCount = MIN_INDICATORS;
        this._onDashAppsChanged = onDashAppsChanged;
        this._onIndicatorsChanged = onIndicatorsChanged;
        this._dialog = null;
        this._dashPopulationTab = null;
        this._indicatorPopulationTab = null;
        this._tabContent = null;
        this._tabButtons = new Map();
    }

    get dashApps() {
        return createMockDashApps(this._dashItemCount);
    }

    get indicators() {
        return createMockIndicators(this._indicatorCount);
    }

    open() {
        if (!this._dialog)
            this._createDialog();

        this._dashPopulationTab.setCount(this._dashItemCount);
        this._indicatorPopulationTab.setCount(this._indicatorCount);
        this._dialog.open();
    }

    _createDialog() {
        this._dialog = new ModalDialog.ModalDialog({
            destroyOnClose: false,
            styleClass: 'stub-dialog',
        });

        this._dialog.contentLayout.add_child(new St.Label({
            text: 'Extension stubs',
            style_class: 'stub-dialog-title',
        }));

        const tabBar = new St.BoxLayout({
            style_class: 'stub-tab-bar',
        });
        const dashTabButton = new St.Button({
            label: 'Dash population',
            style_class: 'stub-tab-button',
        });
        const indicatorTabButton = new St.Button({
            label: 'Indicators',
            style_class: 'stub-tab-button',
        });
        tabBar.add_child(dashTabButton);
        tabBar.add_child(indicatorTabButton);
        this._dialog.contentLayout.add_child(tabBar);

        this._dashPopulationTab = new DashPopulationTab(this._dashItemCount);
        this._indicatorPopulationTab = new IndicatorPopulationTab(
            this._indicatorCount
        );
        this._tabButtons.set('dash', dashTabButton);
        this._tabButtons.set('indicators', indicatorTabButton);

        this._tabContent = new St.Bin();
        this._dialog.contentLayout.add_child(this._tabContent);

        dashTabButton.connect('clicked', () => this._selectTab('dash'));
        indicatorTabButton.connect('clicked', () => this._selectTab('indicators'));
        this._selectTab('dash');

        this._dialog.setButtons([
            {
                label: 'Close',
                action: () => this._dialog.close(),
                key: Clutter.KEY_Escape,
            },
            {
                label: 'Apply',
                isDefault: true,
                action: () => this._applyStubValues(),
                key: Clutter.KEY_Return,
            },
        ]);
    }

    _selectTab(tabName) {
        for (const [name, button] of this._tabButtons) {
            if (name === tabName)
                button.add_style_class_name('selected');
            else
                button.remove_style_class_name('selected');
        }

        const actor = tabName === 'dash'
            ? this._dashPopulationTab.actor
            : this._indicatorPopulationTab.actor;
        this._tabContent.set_child(actor);
    }

    _applyStubValues() {
        this._dashItemCount = this._dashPopulationTab.getCount();
        this._indicatorCount = this._indicatorPopulationTab.getCount();
        this._dashPopulationTab.setCount(this._dashItemCount);
        this._indicatorPopulationTab.setCount(this._indicatorCount);
        this._onDashAppsChanged(this.dashApps);
        this._onIndicatorsChanged(this.indicators);
        this._dialog.close();
    }

    destroy() {
        this._dashPopulationTab?.destroy();
        this._dashPopulationTab = null;
        this._indicatorPopulationTab?.destroy();
        this._indicatorPopulationTab = null;
        this._tabContent = null;
        this._tabButtons.clear();

        this._dialog?.destroy();
        this._dialog = null;
        this._onDashAppsChanged = null;
        this._onIndicatorsChanged = null;
    }
}
