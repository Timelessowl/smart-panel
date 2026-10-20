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
        if (!(object instanceof Clutter.Actor) || !object[propName]) return; //TODO Logger?
        const destroyId = object.connect('destroy', () =>
            this._overrides.delete(propName)
        );
        this._overrides.set(propName, {
            object,
            value: object[propName],
            destroyId,
        });
        object[propName] = newValue;
    }

    clear() {
        this._overrides?.forEach((override, propName) => {
            override.object[propName] = override.value;
            override.object?.disconnect(override.destroyId);
        });
        this._overrides.clear();
    }

    destroy() {
        this.clear();
    }
}
