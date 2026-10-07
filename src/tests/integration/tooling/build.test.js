import * as Assert from 'node:assert/strict';
import * as ChildProcess from 'node:child_process';
import * as Files from 'node:fs/promises';
import * as OS from 'node:os';
import * as Path from 'node:path';
import * as Util from 'node:util';
import * as Fflate from 'fflate';
import * as Stylesheet from '@/tests/stylesheet.js';

const exec = Util.promisify(ChildProcess.execFile);
const projectDirectory = process.cwd();
let fixture;

async function listFiles(directory, prefix = '') {
    const files = [];
    for (const entry of await Files.readdir(directory, {withFileTypes: true})) {
        const relative = Path.join(prefix, entry.name);
        if (entry.isDirectory())
            files.push(...await listFiles(Path.join(directory, entry.name), relative));
        else
            files.push(relative);
    }
    return files.sort();
}

function run(script, env = {}) {
    return exec('npm', ['run', script], {
        cwd: fixture,
        env: {...process.env, ...env},
    });
}

describe('Screenshot build and ZIP workflow', () => {
    beforeAll(async () => {
        fixture = await Files.mkdtemp(Path.join(OS.tmpdir(), 'panel-rollup-'));
        for (const entry of ['src', 'rollup.config.js', 'package.json'])
            await Files.cp(Path.join(projectDirectory, entry), Path.join(fixture, entry), {recursive: true});
        await Files.symlink(Path.join(projectDirectory, 'node_modules'), Path.join(fixture, 'node_modules'), 'dir');
        await Files.mkdir(Path.join(fixture, 'src/extension/assets'), {recursive: true});
        await Files.mkdir(Path.join(fixture, 'src/extension/po'), {recursive: true});
        await Files.writeFile(Path.join(fixture, 'src/extension/assets/example.txt'), 'example asset');
        await Files.writeFile(Path.join(fixture, 'src/extension/po/fr.po'), 'example translation');
    });

    afterAll(async () => {
        if (fixture)
            await Files.rm(fixture, {recursive: true, force: true});
    });

    it('preserves GJS modules, generates metadata and compiles styles and schemas', async () => {
        await run('clean');
        await run('build');
        const dist = Path.join(fixture, 'dist');
        const files = await listFiles(dist);
        for (const required of ['extension.js', 'prefs.js', 'metadata.json', 'stylesheet.css',
            'schemas/gschemas.compiled', 'assets/example.txt', 'po/fr.po'])
            Assert.ok(files.includes(required), `Missing ${required}`);
        Assert.ok(files.some(file => file.endsWith('/dashSource.js')));
        Assert.ok(!files.some(file => file.includes('/tests/') || file.endsWith('.scss')));
        const pkg = JSON.parse(await Files.readFile(Path.join(fixture, 'package.json'), 'utf8'));
        const metadata = JSON.parse(await Files.readFile(Path.join(dist, 'metadata.json'), 'utf8'));
        Assert.deepEqual(metadata, {
            uuid: pkg.uuid, name: pkg.displayName || pkg.name, description: pkg.description,
            version: pkg.version, 'shell-version': pkg['shell-version'],
            'settings-schema': pkg['settings-schema'], 'gettext-domain': pkg['gettext-domain'],
        });
        const css = await Files.readFile(Path.join(dist, 'stylesheet.css'), 'utf8');
        Assert.equal(css.replace(/\s+/g, ''), Stylesheet.stylesheet.replace(/\s+/g, ''));
        Assert.ok((await Files.readFile(Path.join(dist, 'schemas/gschemas.compiled'))).length > 0);
        for (const file of files.filter(file => file.endsWith('.js'))) {
            const code = await Files.readFile(Path.join(dist, file), 'utf8');
            for (const [, id] of code.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) {
                if (id.startsWith('.'))
                    await Files.access(Path.resolve(dist, Path.dirname(file), id));
                else
                    Assert.ok(id.startsWith('gi://') || id.startsWith('resource://')
                        || ['system', 'cairo', 'gettext'].includes(id), `Unresolved runtime import: ${id}`);
            }
        }
        await Assert.rejects(Files.access(Path.join(fixture, 'build')));
    });

    it('rebuilds and packages the distribution with the photographed archive name', async () => {
        await run('clean');
        await run('package');
        const pkg = JSON.parse(await Files.readFile(Path.join(fixture, 'package.json'), 'utf8'));
        const archive = await Files.readFile(Path.join(fixture, 'build', `${pkg.name}.v${pkg.version}.shell-extension.zip`));
        const entries = Fflate.unzipSync(archive);
        const dist = Path.join(fixture, 'dist');
        const files = await listFiles(dist);
        Assert.deepEqual(Object.keys(entries).filter(file => !file.endsWith('/')).sort(), files);
        for (const file of files)
            Assert.deepEqual(Buffer.from(entries[file]), await Files.readFile(Path.join(dist, file)));
    });

    it('dev installs the existing ZIP without rebuilding or restarting the session', async () => {
        const bin = Path.join(fixture, 'bin');
        const record = Path.join(fixture, 'install-args');
        await Files.mkdir(bin, {recursive: true});
        await Files.writeFile(Path.join(bin, 'gnome-extensions'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$PANEL_INSTALL_RECORD"\n', {mode: 0o755});
        await run('package');
        const entry = Path.join(fixture, 'src/extension/extension.js');
        const source = await Files.readFile(entry);
        // Only the previously built ZIP is needed by the install command.
        await Files.writeFile(entry, 'deliberately invalid source');
        try {
            await run('dev', {PATH: `${bin}:${process.env.PATH}`, PANEL_INSTALL_RECORD: record});
        } finally {
            await Files.writeFile(entry, source);
        }
        const pkg = JSON.parse(await Files.readFile(Path.join(fixture, 'package.json'), 'utf8'));
        Assert.equal(await Files.readFile(record, 'utf8'),
            `install\n--force\nbuild/${pkg.name}.v${pkg.version}.shell-extension.zip\n`);
        Assert.ok(!Object.keys(pkg.scripts).some(name => name === 'restart' || name.startsWith('log:')));
    });
});
