import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
// Retained for the commented native BACKGROUND blur comparison below.
// eslint-disable-next-line no-unused-vars
import Shell from 'gi://Shell';
import { RoundedBackgroundBlur } from '@/externals/roundedBackgroundBlur.js';

import * as Constants from '@/constant.js';

export class BaseSection extends St.Widget {
  static {
    GObject.registerClass(this);
  }

  constructor() {
    super({
      style_class: "panel-section",
      layout_manager: new Clutter.BinLayout(),
      clip_to_allocation: true,
    });

    this.canExpand = false;
    this._content = null;
    // The frame paints the band and solid outline. Native St padding places
    // its opaque child inside the band, rather than underneath an overlay.
    this._frame = new St.Bin({
      style_class: "panel-section-frame",
      style: `padding: ${Constants.SECTION_FRAME_WIDTH}px; border-width: ${Constants.SECTION_BORDER_WIDTH}px;`,
      x_expand: true,
      y_expand: true,
      x_align: Clutter.ActorAlign.FILL,
      y_align: Clutter.ActorAlign.FILL,
      clip_to_allocation: true,
    });
    // this._frame.add_effect(
    //   new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 99 }),
    // );
    this._surface = new RoundedBackgroundBlur({ radius: 99 });
    this._surface.set_child(this._frame);
    this.add_child(this._surface);
  }

  setSectionContent(content) {
    if (this._content)
      throw new Error("A panel section can only have one content actor");

    this._content = content;
    this._content.add_style_class_name("panel-piece");
    this._content.x_expand = true;
    this._content.y_expand = true;
    this._content.x_align = Clutter.ActorAlign.FILL;
    this._content.y_align = Clutter.ActorAlign.FILL;
    this._frame.set_child(this._content);
  }

  _setContentVisible(visible) {
    this._content.visible = visible;
    this._frame.visible = visible;
    this._surface.visible = visible;
  }

  destroy() {
    this.canExpand = false;
    this._content = null;
    this._frame = null;
    this._surface = null;
    super.destroy();
  }
}
