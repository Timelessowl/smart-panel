import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import St from "gi://St";

import * as Main from "resource:///org/gnome/shell/ui/main.js";

import {
  DASH_BORDER_WIDTH,
  DASH_ITEM_SIZE,
  DASH_ITEM_SPACING,
  DASH_PADDING,
  SECTION_HEIGHT,
} from "../constant.js";
import { BaseSection } from "./baseSection.js";

const DEFAULT_APPS = [
  { iconName: "folder-symbolic", name: "Files" },
  { iconName: "web-browser-symbolic", name: "Web browser" },
  { iconName: "utilities-terminal-symbolic", name: "Terminal" },
  { iconName: "folder-symbolic", name: "TESTAPP" },
  { iconName: "preferences-system-symbolic", name: "Settings" },
];

export class DashSection extends BaseSection {
    static {
      GObject.registerClass(this);
    }

    constructor(
      apps = DEFAULT_APPS,
      themeManager = null,
      transientInputManager = null,
      scaleFactor = 1,
    ) {
      super();
      this.canExpand = true;

      const dash = new St.BoxLayout({
        style_class: "dash-placeholder",
        style: `padding: ${DASH_PADDING}px; spacing: ${DASH_ITEM_SPACING}px;`,
      });
      this.setSectionContent(dash);

      this._apps = [];
      this._availableWidth = 0;
      this._scaleFactor = scaleFactor;
      this._maxExpansionHeight = this._scale(SECTION_HEIGHT);
      this._expandedSurface = null;
      this._dismissRegistration = null;
      this._dash = dash;
      this._themeManager = themeManager;
      this._transientInputManager = transientInputManager;
      this.preferredWidth = 0;

      this.setApps(apps);
    }

    setApps(apps) {
      this._closeExpanded();
      this._apps = [...apps];
      this._rebuildCollapsed();
    }

    setAvailableSize(width, maxExpansionHeight) {
      const sizeChanged =
        this._availableWidth !== width ||
        this._maxExpansionHeight !== maxExpansionHeight;

      if (!sizeChanged) return;

      this._closeExpanded();
      this._availableWidth = width;
      this._maxExpansionHeight = Math.max(
        this._scale(SECTION_HEIGHT),
        maxExpansionHeight,
      );
      this._rebuildCollapsed();
    }

    _rebuildCollapsed() {
      this._dash.destroy_all_children();

      const capacity = this._getColumnCapacity();
      const hasOverflow = this._apps.length > capacity;
      const visibleAppCount = hasOverflow
        ? Math.max(0, capacity - 1)
        : this._apps.length;
      const visibleCellCount = visibleAppCount + (hasOverflow ? 1 : 0);

      this.preferredWidth =
        this._scale((DASH_PADDING + DASH_BORDER_WIDTH) * 2) +
        visibleCellCount * this._scale(DASH_ITEM_SIZE) +
        Math.max(0, visibleCellCount - 1) * this._scale(DASH_ITEM_SPACING);

      for (const app of this._apps.slice(0, visibleAppCount))
        this._dash.add_child(this._createAppButton(app));

      if (hasOverflow) {
        const hiddenCount = this._apps.length - visibleAppCount;
        const overflowButton = new St.Button({
          label: `+${hiddenCount}`,
          style_class: "dash-app-button dash-overflow-button",
          accessible_name: `Show ${hiddenCount} more apps`,
        });
        const itemSize = this._scale(DASH_ITEM_SIZE);
        overflowButton.set_size(itemSize, itemSize);
        overflowButton.connect("clicked", () => this._openExpanded());
        this._dash.add_child(overflowButton);
      }
    }

    _getColumnCapacity() {
      const frameWidth = this._scale((DASH_PADDING + DASH_BORDER_WIDTH) * 2);
      const usableWidth = Math.max(0, this._availableWidth - frameWidth);

      return Math.max(
        1,
        Math.floor(
          (usableWidth + this._scale(DASH_ITEM_SPACING)) /
            this._scale(DASH_ITEM_SIZE + DASH_ITEM_SPACING),
        ),
      );
    }

    _createAppButton({ iconName, name }, closeExpanded = false) {
      const button = new St.Button({
        style_class: "dash-app-button",
        accessible_name: name,
        child: new St.Icon({
          icon_name: iconName,
          icon_size: 28,
        }),
      });
      const itemSize = this._scale(DASH_ITEM_SIZE);
      button.set_size(itemSize, itemSize);

      if (closeExpanded) button.connect("clicked", () => this._closeExpanded());

      return button;
    }

    _scale(value) {
      return Math.round(value * this._scaleFactor);
    }

    _openExpanded() {
      if (this._expandedSurface) return;

      const columnCount = this._getColumnCapacity();
      const rowCount = Math.ceil(this._apps.length / columnCount);
      const itemSize = this._scale(DASH_ITEM_SIZE);
      const itemSpacing = this._scale(DASH_ITEM_SPACING);
      const gridWidth =
        columnCount * itemSize + Math.max(0, columnCount - 1) * itemSpacing;
      const gridHeight =
        rowCount * itemSize + Math.max(0, rowCount - 1) * itemSpacing;
      const frameInset = this._scale(DASH_PADDING + DASH_BORDER_WIDTH);
      const surfaceWidth = Math.min(
        this._availableWidth,
        gridWidth + frameInset * 2,
      );
      const naturalHeight = gridHeight + frameInset * 2;
      const surfaceHeight = Math.min(naturalHeight, this._maxExpansionHeight);

      const gridLayout = new Clutter.GridLayout({
        column_homogeneous: true,
        column_spacing: itemSpacing,
        row_homogeneous: true,
        row_spacing: itemSpacing,
      });
      const grid = new St.Widget({ layout_manager: gridLayout });
      grid.set_size(gridWidth, gridHeight);

      this._apps.forEach((app, index) => {
        const column = index % columnCount;
        const row = Math.floor(index / columnCount);
        gridLayout.attach(this._createAppButton(app, true), column, row, 1, 1);
      });

      this._expandedSurface = new St.ScrollView({
        style_class: "panel-piece dash-expanded",
        style: `padding: ${DASH_PADDING}px;`,
        enable_mouse_scrolling: true,
        overlay_scrollbars: true,
      });
      this._expandedSurface.set_policy(
        St.PolicyType.NEVER,
        St.PolicyType.AUTOMATIC,
      );

      const scrollContent = new St.BoxLayout({ vertical: true });
      scrollContent.add_child(grid);
      this._expandedSurface.set_child(scrollContent);
      this._expandedSurface.set_size(surfaceWidth, surfaceHeight);

      const [x, y] = this.get_transformed_position();
      this._expandedSurface.set_position(
        Math.round(x),
        Math.round(y + this.height - surfaceHeight),
      );

      this._setContentVisible(false);
      this._themeManager?.addActor(this._expandedSurface);
      Main.layoutManager.addTopChrome(this._expandedSurface, {
        affectsInputRegion: true,
        affectsStruts: false,
        trackFullscreen: true,
      });
      this._dismissRegistration = this._transientInputManager?.register(
        this._expandedSurface,
        () => this._closeExpanded(),
      );
    }

    _closeExpanded() {
      if (!this._expandedSurface) return;

      this._transientInputManager?.unregister(this._dismissRegistration);
      this._dismissRegistration = null;

      this._themeManager?.removeActor(this._expandedSurface);
      Main.layoutManager.removeChrome(this._expandedSurface);
      this._expandedSurface.destroy();
      this._expandedSurface = null;
      this._setContentVisible(true);
    }

    destroy() {
      this._closeExpanded();
      this._themeManager = null;
      this._transientInputManager = null;
      this.preferredWidth = 0;
      this._scaleFactor = 1;
      super.destroy();
    }
}
