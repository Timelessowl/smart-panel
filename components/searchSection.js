import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {MAX_VISIBLE_SUGGESTIONS} from '../constant.js';

export class SearchSection {
    constructor(suggestions = []) {
        this._suggestions = [...suggestions];

        this.actor = new St.BoxLayout({
            style_class: 'panel-piece search-section',
            clip_to_allocation: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.actor.add_child(new St.Icon({
            icon_name: 'system-search-symbolic',
            icon_size: 20,
            style_class: 'search-icon',
        }));

        this.entry = new St.Entry({
            style_class: 'search-entry',
            hint_text: 'Search apps…',
            can_focus: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        this.actor.add_child(this.entry);

        this._layoutButton = new St.Button({
            label: 'EN',
            style_class: 'search-layout-button',
            accessible_name: 'English keyboard layout',
            x_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._layoutClickedId = this._layoutButton.connect('clicked', () => {
            Main.notify('Keyboard layout', 'English (EN)');
        });
        this.actor.add_child(this._layoutButton);

        this._suggestionBox = new St.BoxLayout({
            vertical: true,
            style_class: 'search-suggestions',
            visible: false,
        });
        Main.uiGroup.add_child(this._suggestionBox);

        this._textChangedId = this.entry.clutter_text.connect(
            'text-changed',
            () => this._updateSuggestions()
        );
        this._focusOutId = this.entry.clutter_text.connect(
            'key-focus-out',
            () => this._suggestionBox.hide()
        );
    }

    setSuggestions(suggestions) {
        this._suggestions = [...suggestions];
        this._updateSuggestions();
    }

    _updateSuggestions() {
        const query = this.entry.get_text().trim().toLowerCase();
        this._suggestionBox.destroy_all_children();

        if (!query) {
            this._suggestionBox.hide();
            return;
        }

        const matches = this._suggestions
            .filter(suggestion => suggestion.toLowerCase().includes(query))
            .slice(0, MAX_VISIBLE_SUGGESTIONS);

        for (const suggestion of matches) {
            const button = new St.Button({
                label: suggestion,
                style_class: 'search-suggestion-button',
                x_expand: true,
                x_align: Clutter.ActorAlign.FILL,
            });
            button.connect('button-press-event', () => {
                this.entry.set_text(suggestion);
                this._suggestionBox.hide();
                return Clutter.EVENT_STOP;
            });
            this._suggestionBox.add_child(button);
        }

        if (matches.length > 0) {
            this._suggestionBox.set_height(matches.length * 40 + 12);
            this.updatePopupPosition();
            this._suggestionBox.show();
        } else {
            this._suggestionBox.hide();
        }
    }

    updatePopupPosition() {
        if (!this.actor.mapped)
            return;

        const [x, y] = this.actor.get_transformed_position();
        this._suggestionBox.set_width(this.actor.width);
        this._suggestionBox.set_position(
            Math.round(x),
            Math.round(y - this._suggestionBox.height - 8)
        );
    }

    destroy() {
        this.entry.clutter_text.disconnect(this._textChangedId);
        this.entry.clutter_text.disconnect(this._focusOutId);
        this._layoutButton.disconnect(this._layoutClickedId);
        this._suggestionBox.destroy();
    }
}
