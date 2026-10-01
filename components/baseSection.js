import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {SECTION_FRAME_WIDTH} from '../constant.js';

export class BaseSection extends St.Widget {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            style_class: 'panel-section',
            layout_manager: new Clutter.BinLayout(),
            clip_to_allocation: true,
        });

        this.canExpand = false;
        this._content = null;
        this._frame = new St.Widget({
            style_class: 'panel-section-frame',
            style: `border-width: ${SECTION_FRAME_WIDTH}px;`,
            reactive: false,
            x_expand: true,
            y_expand: true,
        });
        this.add_child(this._frame);
    }

    setSectionContent(content) {
        if (this._content)
            throw new Error('A panel section can only have one content actor');

        this._content = content;
        this._content.add_style_class_name('panel-piece');
        this._content.x_expand = true;
        this._content.y_expand = true;
        this._content.x_align = Clutter.ActorAlign.FILL;
        this._content.y_align = Clutter.ActorAlign.FILL;
        this.insert_child_below(this._content, this._frame);
    }

    _setContentVisible(visible) {
        this._content.visible = visible;
        this._frame.visible = visible;
    }

    destroy() {
        this.canExpand = false;
        this._content = null;
        this._frame = null;
        super.destroy();
    }
}
