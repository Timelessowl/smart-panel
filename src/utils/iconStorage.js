import Gio from 'gi://Gio';
import {Extension} from '@girs/gnome-shell/extensions/extension';

export const Icons = Object.freeze({
    LAUNCHPAD: 'launchpad.svg',
});

const icons = new Map();

export function getIcon(name) {
    if (!icons.has(name)) {
        const extension = Extension.lookupByURL(import.meta.url);
        const file = extension.dir.get_child('assets').get_child(name);
        icons.set(name, new Gio.FileIcon({file}));
    }
    return icons.get(name);
}
