import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Evaluate production GJS modules against narrow API doubles, without GNOME.
export async function loadGjsModule(path, imports, globals = {}) {
    const context = vm.createContext({...globals, console});
    const modules = new Map();
    async function load(url) {
        if (modules.has(url))
            return modules.get(url);
        let module;
        if (imports[url]) {
            const exports = imports[url];
            module = new vm.SyntheticModule(Object.keys(exports), function () {
                for (const [name, value] of Object.entries(exports))
                    this.setExport(name, value);
            }, {context, identifier: url});
        } else {
            module = new vm.SourceTextModule(await readFile(new URL(url), 'utf8'),
                {context, identifier: url});
        }
        modules.set(url, module);
        return module;
    }
    const root = await load(path.href);
    await root.link((specifier, parent) => load(specifier.startsWith('.')
        ? new URL(specifier, parent.identifier).href : specifier));
    await root.evaluate();
    return root.namespace;
}

export class SignalObject {
    constructor() {
        this.signals = new Map();
        this.nextId = 1;
    }

    connect(signal, callback) {
        const id = this.nextId++;
        this.signals.set(id, {signal, callback});
        return id;
    }

    disconnect(id) {
        if (!this.signals.delete(id))
            throw new Error(`Unknown signal ${id}`);
    }

    emit(signal, ...args) {
        for (const record of [...this.signals.values()]) {
            if (record.signal === signal)
                record.callback(this, ...args);
        }
    }
}
