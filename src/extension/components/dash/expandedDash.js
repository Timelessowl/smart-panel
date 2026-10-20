import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from '@girs/gnome-shell/ui/main';
import * as Constants from '@/extension/constants.js';
import {BaseSection} from '@/extension/components/baseSection.js';
import * as DashLayout from '@/extension/components/dash/dashLayout.js';

export class ExpandedDash extends BaseSection {
    static {
        GObject.registerClass(this);
    }

    constructor({
        entries,
        iconSize,
        availableWidth,
        maxHeight,
        scaleFactor,
        createToken,
        dragDrop,
        themeManager,
        transientInputManager,
        menuActors,
    }) {
        super();
        this.add_style_class_name('bottom-panel-surface');
        this._dragDrop = dragDrop;
        this._themeManager = themeManager;
        this._transientInputManager = transientInputManager;
        this._menuActors = menuActors;
        this._registration = null;
        this._opened = false;
        this._closed = false;
        const layout = DashLayout.expandedLayout(
            entries,
            iconSize,
            availableWidth,
            scaleFactor
        );
        const grid = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            width: layout.width,
            height: layout.height,
        });
        for (const {token, x, y} of layout.placements) {
            const actor = createToken(token);
            actor.set_position(x, y);
            grid.add_child(actor);
        }
        const scroll = new St.ScrollView({
            style: `padding: ${Constants.DASH_PADDING}px;`,
            enable_mouse_scrolling: true,
            overlay_scrollbars: true,
        });
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        const content = new St.BoxLayout({vertical: true});
        content.add_child(grid);
        scroll.set_child(content);
        this.setSectionContent(scroll);
        dragDrop.addDropZone(grid, this);
        const height =
            layout.height +
            2 * DashLayout.scaleDimension(Constants.DASH_PADDING, scaleFactor) +
            2 *
                DashLayout.scaleDimension(
                    Constants.SECTION_FRAME_WIDTH,
                    scaleFactor
                ) +
            2 *
                DashLayout.scaleDimension(
                    Constants.SECTION_CONTENT_BORDER_WIDTH,
                    scaleFactor
                ) +
            2 *
                DashLayout.scaleDimension(
                    Constants.SECTION_BORDER_WIDTH,
                    scaleFactor
                );
        this.set_size(
            Math.min(
                availableWidth,
                DashLayout.sectionWidth(layout.width, scaleFactor)
            ),
            Math.min(maxHeight, height)
        );
    }

    open(anchor) {
        if (this._opened || this._closed) return;
        const [x, y] = anchor.get_transformed_position();
        this.set_position(
            Math.round(x),
            Math.round(y + anchor.height - this.height)
        );
        this._themeManager.addActor(this);
        Main.layoutManager.addTopChrome(this, {
            affectsInputRegion: true,
            affectsStruts: false,
            trackFullscreen: true,
        });
        this._opened = true;
        this._registration = this._transientInputManager.register(
            this,
            () => this.destroy(),
            this._menuActors
        );
        this._dragDrop.setExpandedSurface(this);
    }

    setDragging(dragging) {
        if (this._registration) this._registration.paused = dragging;
    }

    destroy() {
        if (this._closed) return;
        this._closed = true;
        if (this._opened) {
            this._dragDrop.setExpandedSurface(null);
            this._transientInputManager.unregister(this._registration);
            this._registration = null;
            this._themeManager.removeActor(this);
            Main.layoutManager.removeChrome(this);
        }
        super.destroy();
    }
}
