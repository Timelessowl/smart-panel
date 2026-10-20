import Logger from '@/utils/logger';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {RoundedBackgroundBlur} from '@/externals/roundedBackgroundBlur.js';

import * as Constants from '@/extension/constants.js';
export class BaseSection extends St.Widget {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            layout_manager: new Clutter.BinLayout(),
            clip_to_allocation: true,
        });

        this.canExpand = false;
        this._content = null;
        this._frame = new St.Bin({
            style_class: 'panel-section',
            style: `padding: ${Constants.SECTION_FRAME_WIDTH}px; border-width: ${Constants.SECTION_BORDER_WIDTH}px;`,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            clip_to_allocation: true,
        });
        // TODO run some checks - maybe GPU heavy
        this._surface = new RoundedBackgroundBlur({radius: 44});
        this._surface.set_child(this._frame);
        this.add_child(this._surface);
    }

    setSectionContent(content) {
        if (this._content)
            Logger.error('A panel section can only have one content actor');

        this._content = content;
        this._content.add_style_class_name('panel-section-content');
        this._content.x_expand = true;
        this._content.y_expand = true;
        this._content.x_align = Clutter.ActorAlign.FILL;
        this._content.y_align = Clutter.ActorAlign.FILL;
        this._frame.add_child(this._content);
    }

    _setContentVisible(visible) {
        this._surface.visible = visible;
    }

    destroy() {
        this.canExpand = false;
        this._content = null;
        super.destroy();
    }
}
