import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

export const MIN_INDICATORS = 0;
export const MAX_INDICATORS = 10;

export class IndicatorPopulationTab extends St.BoxLayout {
    static {
        GObject.registerClass(this);
    }

    constructor(initialCount) {
        super({
            vertical: true,
            style_class: 'stub-tab-content',
        });

        this.add_child(new St.Label({
            text: 'Number of indicators',
            style_class: 'stub-field-label',
            x_align: Clutter.ActorAlign.START,
        }));

        const controls = new St.BoxLayout({
            style_class: 'stub-number-controls',
            x_align: Clutter.ActorAlign.CENTER,
        });

        this._decreaseButton = new St.Button({
            label: '−',
            style_class: 'stub-number-button',
            accessible_name: 'Decrease indicator population',
        });
        this._entry = new St.Entry({
            style_class: 'stub-number-entry',
            can_focus: true,
        });
        this._increaseButton = new St.Button({
            label: '+',
            style_class: 'stub-number-button',
            accessible_name: 'Increase indicator population',
        });

        controls.add_child(this._decreaseButton);
        controls.add_child(this._entry);
        controls.add_child(this._increaseButton);
        this.add_child(controls);

        this.add_child(new St.Label({
            text: `Allowed range: ${MIN_INDICATORS}–${MAX_INDICATORS}`,
            style_class: 'stub-field-help',
            x_align: Clutter.ActorAlign.CENTER,
        }));

        this._decreaseId = this._decreaseButton.connect('clicked', () => {
            this.setCount(this.getCount() - 1);
        });
        this._increaseId = this._increaseButton.connect('clicked', () => {
            this.setCount(this.getCount() + 1);
        });

        this.setCount(initialCount);
    }

    getCount() {
        const parsedCount = Number.parseInt(this._entry.get_text(), 10);
        const count = Number.isFinite(parsedCount) ? parsedCount : MIN_INDICATORS;

        return Math.min(MAX_INDICATORS, Math.max(MIN_INDICATORS, count));
    }

    setCount(count) {
        const clampedCount = Math.min(
            MAX_INDICATORS,
            Math.max(MIN_INDICATORS, count)
        );
        this._entry.set_text(`${clampedCount}`);
    }

    destroy() {
        this._decreaseButton.disconnect(this._decreaseId);
        this._increaseButton.disconnect(this._increaseId);
        super.destroy();
    }
}
