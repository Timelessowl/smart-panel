import * as Files from 'node:fs/promises';
import * as VM from 'node:vm';
import * as Url from 'node:url';

export const sourceDirectory = Url.pathToFileURL(`${process.cwd()}/src/`);

// Evaluate production GJS modules against narrow API doubles, without GNOME.
export async function loadGjsModule(path, imports, globals = {}) {
    const context = VM.createContext({console, ...globals});
    const modules = new Map();
    async function load(url) {
        if (modules.has(url))
            return modules.get(url);
        // Cache the pending read too: diamond imports must share class identity.
        const pending = (async () => {
            if (imports[url]) {
                const exports = imports[url];
                return new VM.SyntheticModule(Object.keys(exports), function () {
                    for (const [name, value] of Object.entries(exports))
                        this.setExport(name, value);
                }, {context, identifier: url});
            }
            return new VM.SourceTextModule(await Files.readFile(new URL(url), 'utf8'),
                {context, identifier: url});
        })();
        modules.set(url, pending);
        return pending;
    }
    const root = await load(path.href);
    function resolve(specifier, parent) {
        if (imports[specifier]) return specifier;
        if (specifier.startsWith('@/'))
            return new URL(`${specifier.slice(2)}${/\.\w+$/.test(specifier) ? '' : '.js'}`, sourceDirectory).href;
        if (specifier.startsWith('@girs/')) {
            const resource = specifier.replace('@girs/gnome-shell/', 'resource:///org/gnome/shell/') + '.js';
            return imports[resource] ? resource : import.meta.resolve(specifier);
        }
        return specifier.startsWith('.') ? new URL(specifier, parent.identifier).href : specifier;
    }
    // Validate doubles before Node links dependencies concurrently. Otherwise
    // one missing GI mock can leave unrelated rejected link promises behind and
    // incorrectly fail a later Jasmine suite through an unhandled rejection.
    const prepared = new Set();
    async function prepare(module) {
        if (prepared.has(module.identifier)) return;
        prepared.add(module.identifier);
        for (const specifier of module.dependencySpecifiers ?? []) {
            const url = resolve(specifier, module);
            if (!imports[url] && !url.startsWith('file:'))
                throw new Error(`Missing GJS API double: ${specifier}`);
            await prepare(await load(url));
        }
    }
    await prepare(root);
    await root.link((specifier, parent) => load(resolve(specifier, parent)));
    await root.evaluate();
    return root.namespace;
}

export class SignalObject {
    constructor() {
        this.signals = new Map();
        this.nextId = 1;
        this._objectConnections = new Map();
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

    // Model Shell's owner-bound connections: destruction disconnects only the
    // owner's handlers, including multiple handlers attached to one emitter.
    connectObject(signal, callback, owner) {
        let record = this._objectConnections.get(owner);
        if (!record) {
            record = {ids: new Set(), destroyId: owner.connect('destroy', () =>
                this.disconnectObject(owner))};
            this._objectConnections.set(owner, record);
        }
        record.ids.add(this.connect(signal, callback));
    }

    disconnectObject(owner) {
        const record = this._objectConnections.get(owner);
        if (!record)
            return;
        this._objectConnections.delete(owner);
        for (const id of record.ids)
            this.disconnect(id);
        owner.disconnect(record.destroyId);
    }

    run_dispose() {
        for (const owner of this._objectConnections.keys())
            this.disconnectObject(owner);
        this.signals.clear();
    }

    emit(signal, ...args) {
        for (const [id, record] of [...this.signals]) {
            if (this.signals.has(id) && record.signal === signal)
                record.callback(this, ...args);
        }
    }
}

export function createGObjectDouble() {
    return {Object: SignalObject, registerClass(metadata, klass = metadata) {
        if (metadata.Signals)
            klass.signalDefinitions = metadata.Signals;
        return klass;
    }};
}
