import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {AppIcon} from '@girs/gnome-shell/ui/appDisplay';
import * as GrabHelper from '@girs/gnome-shell/ui/grabHelper';
import * as Main from '@girs/gnome-shell/ui/main';
import * as ParentalControlsManager from '@girs/gnome-shell/misc/parentalControlsManager';

import * as Constants from '@/extension/constants.js';
import * as Session from '@/utils/session.js';
import {RoundedBackgroundBlur} from '@/externals/roundedBackgroundBlur.js';
import PropertyOverrideManager from '@/utils/propertyOverrideManager.js';

// Keep Shell's activation (including Ctrl/middle-click), running indicator,
// keyboard handling and AppMenu. Only the surrounding overview is ours.
export class LaunchpadIcon extends AppIcon {
    static {
        GObject.registerClass(this);
    }

    constructor(app, owner) {
        super(app, {
            isDraggable: false,
            expandTitleOnHover: false,
            createIcon: null,
            setSizeManually: true,
            showLabel: true,
        });
        this._launchpad = owner;
        this.add_style_class_name('launchpad-app');
        this.connect('menu-state-changed', (_icon, open) => {
            if (!open || this._menuConnected) return;
            this._menuConnected = true;
            this._menu.connect('activate', (_menu, item) => {
                // Pin/unpin and Quit keep the picker available, as in Shell.
                if (item !== this._menu._toggleFavoriteItem && item !== this._menu._quitItem)
                    this._launchpad.closeAppGrid();
            });
        });
        this.connect('destroy', () => {
            this._menu?.destroy();
            this._menu = null;
        });
    }

    activate(button) {
        super.activate(button);
        this._launchpad.closeAppGrid();
    }

    closeMenu() {
        this._menu?.close();
    }
}

export class AppGrid extends St.Widget {
    static {
        GObject.registerClass(this);
    }

    constructor(panel) {
        super({
            style_class: 'bottom-panel-surface launchpad',
            layout_manager: new Clutter.FixedLayout(),
            reactive: true,
            visible: false,
            clip_to_allocation: true,
        });
        this._panel = panel;
        this._searchSection = panel._searchSection;
        this._overrideManager = new PropertyOverrideManager();
        this._appSystem = Shell.AppSystem.get_default();
        this._parentalControls = ParentalControlsManager.getDefault();
        this._icons = new Map();
        this._results = [];
        this._page = 0;
        this.isOpen = false;
        this._grabHelper = new GrabHelper.GrabHelper(panel, {actionMode: Shell.ActionMode.POPUP});

        this._background = new RoundedBackgroundBlur({radius: 44, brightness: 0.8});
        this._background.set_child(new St.Widget({style_class: 'launchpad-background'}));
        this.add_child(this._background);
        this._content = new St.Widget({layout_manager: new Clutter.FixedLayout(), reactive: true});
        this.add_child(this._content);
        this._grid = new St.Widget({layout_manager: new Clutter.FixedLayout(), reactive: true});
        this._content.add_child(this._grid);
        this._dots = new St.BoxLayout({
            style_class: 'launchpad-pages',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pageControls = new St.Bin({child: this._dots});
        this._content.add_child(this._pageControls);
        this._empty = new St.Bin({
            child: new St.Label({
                text: 'No apps found',
                style_class: 'launchpad-empty',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.START,
            }),
        });
        this._content.add_child(this._empty);

        const text = this._searchSection.entry.clutter_text;
        text.connectObject(
            'text-changed',
            () => {
                if (this.isOpen) this._refresh(true);
            },
            this,
        );
        text.connectObject(
            'activate',
            () => {
                if (this.isOpen)
                    this._icons.get(this._results[this._page * Constants.APP_GRID_PAGE_SIZE]?.get_id())?.activate(1);
            },
            this,
        );
        text.connectObject(
            'key-press-event',
            (_text, event) => {
                if (!this.isOpen || event.get_key_symbol() !== Clutter.KEY_Up) return Clutter.EVENT_PROPAGATE;
                const first = this._results[this._page * Constants.APP_GRID_PAGE_SIZE];
                this._icons.get(first?.get_id())?.grab_key_focus();
                return Clutter.EVENT_STOP;
            },
            this,
        );
        this._appSystem.connectObject(
            'installed-changed',
            () => {
                if (this.isOpen) this._refresh();
            },
            this,
        );
        this._parentalControls.connectObject(
            'app-filter-changed',
            () => {
                if (this.isOpen) this._refresh();
            },
            this,
        );
        Main.overview.connectObject('showing', () => this.closeAppGrid(), this);
        panel.connectObject(
            'notify::allocation',
            () => {
                if (this.isOpen) this.updateGeometry();
            },
            this,
        );
        panel.connectObject('destroy', () => this.destroy(), this);
        panel.connectObject(
            'button-press-event',
            (_actor, event) => (this.isOpen ? this._dismissBackground(event) : Clutter.EVENT_PROPAGATE),
            this,
        );
        panel.connectObject(
            'touch-event',
            (_actor, event) =>
                this.isOpen && event.type() === Clutter.EventType.TOUCH_BEGIN
                    ? this._dismissBackground(event)
                    : Clutter.EVENT_PROPAGATE,
            this,
        );
        panel.connectObject(
            'scroll-event',
            (_actor, event) => (this.isOpen ? this._onScroll(event) : Clutter.EVENT_PROPAGATE),
            this,
        );
        panel.connectObject(
            'key-press-event',
            (_actor, event) => {
                if (!this.isOpen) return Clutter.EVENT_PROPAGATE;
                const key = event.get_key_symbol();
                if (key !== Clutter.KEY_Page_Up && key !== Clutter.KEY_Page_Down) return Clutter.EVENT_PROPAGATE;
                this.goToPage(this._page + (key === Clutter.KEY_Page_Down ? 1 : -1));
                return Clutter.EVENT_STOP;
            },
            this,
        );
        global.focus_manager.add_group(panel);
        this.connect('destroy', () => {
            this.closeAppGrid();
            this._overrideManager.destroy();
            global.focus_manager.remove_group(panel);
        });
    }

    appGridActive() {
        return this.isOpen;
    }

    openAppGrid() {
        if (this.isOpen) return;
        this.isOpen = true;
        this._lastScrollTime = 0;
        this._scrollDelta = 0;
        for (const section of this._panel._components) {
            if (section === this._searchSection) continue;
            this._overrideManager.overrideProperty(section, 'visible', false);
        }
        this._panel._themeManager.addActor(this);
        this.updateGeometry();
        this._refresh(true);
        this.show();
        if (
            !this._grabHelper.grab({
                actor: this._panel,
                focus: this._searchSection.entry.clutter_text,
                onUngrab: () => this.closeAppGrid(),
            })
        )
            this.closeAppGrid();
    }

    closeAppGrid() {
        if (!this.isOpen) return;
        this.isOpen = false;
        for (const icon of this._icons.values()) icon.closeMenu();
        this._grabHelper.ungrab({actor: this._panel});
        this._overrideManager.clear();
        this._panel._themeManager.removeActor(this);
        this.hide();
    }

    updateGeometry() {
        const {width, height} = this._panel._monitor;
        this.set_position(0, this._panel.height - height);
        this.set_size(width, height);
        this._background.set_size(width, height);
        const margin = Math.min(Session.scale(Constants.APP_GRID_MARGIN), width * 0.05);
        const availableHeight = Math.max(1, height - Session.scale(Constants.PANEL_HEIGHT) - margin * 2);
        const gridWidth = Math.min(Session.scale(Constants.APP_GRID_MAX_WIDTH), width - margin * 2);
        const cell = Math.max(
            1,
            Math.min(
                gridWidth / Constants.APP_GRID_COLUMNS,
                (availableHeight - Session.scale(Constants.APP_GRID_DOTS_HEIGHT)) / Constants.APP_GRID_ROWS,
            ),
        );
        this._cellSize = Math.floor(cell);
        const contentWidth = this._cellSize * Constants.APP_GRID_COLUMNS;
        const gridHeight = this._cellSize * Constants.APP_GRID_ROWS;
        const contentHeight = gridHeight + Session.scale(Constants.APP_GRID_DOTS_HEIGHT);
        this._content.set_position(
            Math.round((width - contentWidth) / 2),
            Math.round(margin + (availableHeight - contentHeight) / 2),
        );
        this._content.set_size(contentWidth, contentHeight);
        this._grid.set_size(contentWidth, gridHeight);
        this._pageControls.set_position(0, gridHeight);
        this._pageControls.set_size(contentWidth, Session.scale(Constants.APP_GRID_DOTS_HEIGHT));
        this._empty.set_position(0, 0);
        this._empty.width = contentWidth;
        if (this._results.length) this._showPage();
    }

    _refresh(resetPage = false) {
        const query = this._searchSection.entry.get_text().trim();
        const visible = (app) =>
            app && this._parentalControls.initialized && this._parentalControls.shouldShowApp(app.get_app_info());
        if (query) {
            const usage = Shell.AppUsage.get_default();
            this._results = Shell.AppSystem.search(query)
                .flatMap((group) => [...group].sort((a, b) => usage.compare(a, b)))
                .map((id) => this._appSystem.lookup_app(id))
                .filter(visible);
        } else {
            this._results = this._appSystem
                .get_installed()
                .map((info) => this._appSystem.lookup_app(info.get_id()))
                .filter(visible)
                .sort((a, b) => a.get_name().localeCompare(b.get_name()));
        }
        const keep = new Set(this._results.map((app) => app.get_id()));
        for (const [id, icon] of this._icons) {
            if (keep.has(id) && icon.app === this._appSystem.lookup_app(id)) continue;
            icon.destroy();
            this._icons.delete(id);
        }
        const pages = Math.max(1, Math.ceil(this._results.length / Constants.APP_GRID_PAGE_SIZE));
        this._page = resetPage ? 0 : Math.min(this._page, pages - 1);
        this._dots.destroy_all_children();
        for (let page = 0; page < pages; page++) {
            const dot = new St.Button({
                style_class: 'launchpad-page',
                can_focus: true,
                accessible_name: `Page ${page + 1} of ${pages}`,
                child: new St.Widget({style_class: 'launchpad-page-dot'}),
            });
            dot.connect('clicked', () => this.goToPage(page));
            this._dots.add_child(dot);
        }
        this._showPage();
    }

    goToPage(page) {
        const pages = Math.max(1, Math.ceil(this._results.length / Constants.APP_GRID_PAGE_SIZE));
        const next = Math.max(0, Math.min(page, pages - 1));
        if (next === this._page) return;
        this._page = next;
        // Focus must not remain on an icon hidden on the previous page.
        this._searchSection.entry.grab_key_focus();
        this._showPage();
    }

    _showPage() {
        for (const icon of this._icons.values()) {
            icon.closeMenu();
            icon.hide();
        }
        const start = this._page * Constants.APP_GRID_PAGE_SIZE;
        this._results.slice(start, start + Constants.APP_GRID_PAGE_SIZE).forEach((app, index) => {
            let icon = this._icons.get(app.get_id());
            if (!icon) {
                icon = new LaunchpadIcon(app, this);
                this._icons.set(app.get_id(), icon);
                this._grid.add_child(icon);
            }
            this._grid.set_child_at_index(icon, index);
            icon.icon.setIconSize(
                Math.max(
                    1,
                    Math.min(Constants.APP_GRID_ICON_SIZE, Math.floor((this._cellSize / Session.scale(1)) * 0.5)),
                ),
            );
            icon.set_size(this._cellSize, this._cellSize);
            icon.set_position(
                (index % Constants.APP_GRID_COLUMNS) * this._cellSize,
                Math.floor(index / Constants.APP_GRID_COLUMNS) * this._cellSize,
            );
            icon.show();
        });
        this._dots.get_children().forEach((actor, index) => {
            const dot = /** @type {St.Button} */ (actor);
            if (index === this._page) dot.add_style_pseudo_class('checked');
            else dot.remove_style_pseudo_class('checked');
        });
        this._empty.visible = this._results.length === 0;
    }

    _dismissBackground(event) {
        const target = global.stage.get_event_actor(event);
        if (target && (this._content.contains(target) || this._searchSection.contains(target)))
            return Clutter.EVENT_PROPAGATE;
        this.closeAppGrid();
        return Clutter.EVENT_STOP;
    }

    _onScroll(event) {
        if (this._searchSection.contains(global.stage.get_event_actor(event))) return Clutter.EVENT_PROPAGATE;
        const direction = event.get_scroll_direction();
        let delta;
        if (direction === Clutter.ScrollDirection.SMOOTH) {
            const [dx, dy] = event.get_scroll_delta();
            delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
            // Accumulate touchpad motion so one gesture doesn't skip every page.
            this._scrollDelta = (this._scrollDelta ?? 0) + delta;
            if (Math.abs(this._scrollDelta) < 1) return Clutter.EVENT_STOP;
            delta = this._scrollDelta;
            this._scrollDelta = 0;
        } else {
            delta = [Clutter.ScrollDirection.DOWN, Clutter.ScrollDirection.RIGHT].includes(direction) ? 1 : -1;
        }
        const time = event.get_time();
        if (!this._lastScrollTime || time - this._lastScrollTime >= Constants.APP_GRID_SCROLL_TIMEOUT) {
            this.goToPage(this._page + Math.sign(delta));
            this._lastScrollTime = time;
        }
        return Clutter.EVENT_STOP;
    }
}
