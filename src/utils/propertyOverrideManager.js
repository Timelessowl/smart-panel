import Clutter from 'gi://Clutter';

export default class PropertyOverrideManager {
    constructor() {
        this._overrides = new Map();
    }

    /**
     * @param {Clutter.Actor} object
     * @param {string} propName
     * @param {any} newValue
     **/
    overrideProperty(object, propName, newValue) {
        if (!(object instanceof Clutter.Actor) || !(propName in object)) return;
        const key = `${object.constructor.name}-${propName}`;
        if (!this._overrides.has(key)) {
            const destroyId = object.connect('destroy', () => this._overrides.delete(key));
            this._overrides.set(key, {object, propName, value: object[propName], destroyId});
        }
        object[propName] = newValue;
    }

    clear() {
        this._overrides.forEach((override) => {
            override.object[override.propName] = override.value;
            override.object?.disconnect(override.destroyId);
        });
        this._overrides.clear();
    }

    destroy() {
        this.clear();
    }
}
