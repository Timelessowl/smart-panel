import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {MAX_VISIBLE_SUGGESTIONS} from '../constant.js';
import {BaseSection} from './baseSection.js';

export const SearchSection = GObject.registerClass(
class SearchSection extends BaseSection {
    constructor(suggestions = [], scaleFactor = 1) {
        super({canExpand: false});

        const content = new St.BoxLayout({
            style_class: 'search-section',
        });
        this._setContent(content);

        this._suggestions = [...suggestions];
        this._scaleFactor = scaleFactor;

        content.add_child(new St.Icon({
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
        content.add_child(this.entry);

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
        content.add_child(this._layoutButton);

        this._suggestionBox = new St.BoxLayout({
            vertical: true,
            style_class: 'search-suggestions',
            visible: false,
        });
        Main.layoutManager.addTopChrome(this._suggestionBox, {
            affectsInputRegion: true,
            affectsStruts: false,
            trackFullscreen: true,
        });

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
            this._suggestionBox.set_height(
                Math.round((matches.length * 40 + 12) * this._scaleFactor)
            );
            this.updatePopupPosition();
            this._suggestionBox.show();
        } else {
            this._suggestionBox.hide();
        }
    }

    updatePopupPosition() {
        if (!this.mapped)
            return;

        const [x, y] = this.get_transformed_position();
        this._suggestionBox.set_width(this.width);
        this._suggestionBox.set_position(
            Math.round(x),
            Math.round(y - this._suggestionBox.height -
                8 * this._scaleFactor)
        );
    }

    destroy() {
        this.entry.clutter_text.disconnect(this._textChangedId);
        this.entry.clutter_text.disconnect(this._focusOutId);
        this._layoutButton.disconnect(this._layoutClickedId);
        Main.layoutManager.removeChrome(this._suggestionBox);
        this._suggestionBox.destroy();
        this._scaleFactor = 1;
        super.destroy();
    }
});
