import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as GrabHelper from '@girs/gnome-shell/ui/grabHelper';
import * as Main from '@girs/gnome-shell/ui/main';
import * as Constants from '@/extension/constants.js';
import {BaseSection} from '@/extension/components/baseSection.js';
import * as DashLayout from '@/extension/components/dash/dashLayout.js';

export class ExpandedDash extends BaseSection {
    static {
        GObject.registerClass({Signals: {closed: {}}}, this);
    }

    constructor({entries, iconSize, availableWidth, maxHeight, syncTokens, dragDrop, themeManager}) {
        super();
        this.add_style_class_name('bottom-panel-surface');
        this._dragDrop = dragDrop;
        this._themeManager = themeManager;
        this._syncTokens = syncTokens;
        this._anchor = null;
        this._grabHelper = new GrabHelper.GrabHelper(this, {
            actionMode: Shell.ActionMode.POPUP,
        });
        this.isOpen = false;
        this._closed = false;
        global.focus_manager.add_group(this);
        this._grid = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
        });
        const scroll = new St.ScrollView({
            style: `padding: ${Constants.DASH_PADDING}px;`,
            enable_mouse_scrolling: true,
            overlay_scrollbars: true,
        });
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        const content = new St.BoxLayout({vertical: true});
        content.add_child(this._grid);
        scroll.set_child(content);
        this.setSectionContent(scroll);
        dragDrop.addDropZone(this._grid, this);
        this.update({entries, iconSize, availableWidth, maxHeight});
        this.hide();
    }

    update({entries, iconSize, availableWidth, maxHeight}) {
        const layout = DashLayout.expandedLayout(entries, iconSize, availableWidth);
        this._syncTokens(
            this._grid,
            layout.placements.map((placement) => placement.token),
            iconSize,
        );
        this._grid.set_size(layout.width, layout.height);
        const actors = this._grid.get_children();
        for (const [index, {x, y}] of layout.placements.entries()) actors[index].set_position(x, y);
        const height = DashLayout.sectionWidth(layout.height);
        this.set_size(Math.min(availableWidth, DashLayout.sectionWidth(layout.width)), Math.min(maxHeight, height));
        if (this.isOpen) this._updatePosition();
    }

    open(anchor) {
        if (this.isOpen || this._closed) return;
        this._anchor = anchor;
        this._updatePosition();
        this._themeManager.addActor(this);
        this.show();
        Main.layoutManager.addTopChrome(this, {
            affectsInputRegion: true,
            affectsStruts: false,
            trackFullscreen: true,
        });
        this.isOpen = true;
        if (!this._grabHelper.grab({actor: this, onUngrab: () => this.close()})) {
            this.close();
            return;
        }
        this._dragDrop.setExpandedSurface(this);
    }

    _updatePosition() {
        const [x, y] = this._anchor.get_transformed_position();
        this.set_position(Math.round(x), Math.round(y + this._anchor.height - this.height));
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this._grabHelper.ungrab({actor: this});
        this._dragDrop.setExpandedSurface(null);
        this._themeManager.removeActor(this);
        Main.layoutManager.removeChrome(this);
        // GrabHelper calls onUngrab before releasing its modal grab. Keep the
        // actor alive, like Shell's app-folder dialog, until explicit teardown.
        this.hide();
        this.emit('closed');
    }

    destroy() {
        if (this._closed) return;
        this._closed = true;
        this.close();
        super.destroy();
    }
}
