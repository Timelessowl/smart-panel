import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after, before, test} from 'node:test';
import {promisify} from 'node:util';
import {unzipSync} from 'fflate';
import {listFiles, projectDirectory} from '../scripts/shared.mjs';
import {stylesheet} from './stylesheet.mjs';

const exec = promisify(execFile);
const uuid = 'simple-bottom-panel@local';
let fixture;
let distribution;

function run(script, args = [], env = {}) {
    return exec(process.execPath, [join(fixture, 'scripts', `${script}.mjs`), ...args], {
        cwd: tmpdir(), // Scripts must resolve paths relative to the project, not the caller.
        env: {...process.env, ...env},
    });
}

before(async () => {
    fixture = await mkdtemp(join(tmpdir(), 'panel-tooling-'));
    distribution = join(fixture, 'dist');
    const directories = ['components', 'externals', 'schemas', 'scripts', 'style'];
    for (const entry of await readdir(projectDirectory)) {
        if (directories.includes(entry) || /\.(js|mjs)$/.test(entry)
            || ['metadata.json', 'package.json'].includes(entry))
            await cp(join(projectDirectory, entry), join(fixture, entry), {recursive: true});
    }
    await symlink(join(projectDirectory, 'node_modules'), join(fixture, 'node_modules'), 'dir');
    await mkdir(distribution);
    await writeFile(join(distribution, 'obsolete.js'), 'old module');
    await run('build');
});

after(async () => {
    if (fixture)
        await rm(fixture, {recursive: true, force: true});
});

test('build produces GJS entry points, Sass output and a compiled schema without development files', async () => {
    const files = await listFiles(distribution);
    assert.deepEqual(files, [
        'extension.js', 'metadata.json', 'prefs.js',
        'schemas/gschemas.compiled', 'schemas/org.gnome.shell.extensions.simple-bottom-panel.gschema.xml',
        'stylesheet.css',
    ]);
    assert.equal((await readFile(join(distribution, 'stylesheet.css'), 'utf8')).trim(), stylesheet.trim());
    assert.ok((await readFile(join(distribution, 'schemas/gschemas.compiled'))).length > 0);
    for (const entry of ['extension.js', 'prefs.js']) {
        const source = await readFile(join(distribution, entry), 'utf8');
        const imports = [...source.matchAll(/^import .*?from ['"]([^'"]+)['"]/gm)];
        assert.ok(imports.length > 0);
        assert.ok(imports.every(([, id]) => id.startsWith('gi://') || id.startsWith('resource://')));
        assert.match(source, /export \{ .* as default \}/);
        await exec(process.execPath, ['--check', join(distribution, entry)]);
    }
    const prefs = await readFile(join(distribution, 'prefs.js'), 'utf8');
    assert.ok(!prefs.includes('gi://Shell'));
    assert.ok(!prefs.includes('resource:///org/gnome/shell/ui/'));
    // Packaging and installation must use the built files even if source has changed.
    await writeFile(join(fixture, 'extension.js'), 'this source is deliberately invalid');
});

test('pack archives the existing dist files at the ZIP root', async () => {
    await run('pack');
    const archive = await readFile(join(fixture, 'releases', `${uuid}.shell-extension.zip`));
    const entries = unzipSync(archive);
    const files = await listFiles(distribution);
    assert.deepEqual(Object.keys(entries).sort(), [...files].sort());
    for (const file of files)
        assert.deepEqual(Buffer.from(entries[file]), await readFile(join(distribution, file)));
});

test('install respects XDG_DATA_HOME, supports an explicit target and removes obsolete files', async () => {
    const dataDirectory = join(fixture, 'local-data');
    const destination = join(dataDirectory, 'gnome-shell/extensions', uuid);
    await run('install', [], {XDG_DATA_HOME: dataDirectory});
    await writeFile(join(destination, 'obsolete.js'), 'obsolete');
    await run('install', ['--dest', destination]);
    const files = await listFiles(distribution);
    assert.deepEqual(await listFiles(destination), files);
    for (const file of files)
        assert.deepEqual(await readFile(join(destination, file)), await readFile(join(distribution, file)));
    const explicitTarget = join(fixture, 'other-install');
    await run('install', ['--dest', explicitTarget]);
    assert.deepEqual(await listFiles(explicitTarget), files);
});

test('pack and install reject an incomplete build without touching an existing installation', async () => {
    const destination = join(fixture, 'other-install');
    const installedMetadata = await readFile(join(destination, 'metadata.json'));
    await assert.rejects(run('install', ['--dest', fixture]), /separate from the build/);
    const preservedTarget = join(fixture, 'preserved-target');
    await mkdir(preservedTarget);
    await writeFile(join(preservedTarget, 'marker'), 'keep me');
    await rm(join(distribution, 'stylesheet.css'));
    await assert.rejects(run('pack'), /Run npm run build first/);
    await assert.rejects(run('install', ['--dest', destination]), /Run npm run build first/);
    await assert.rejects(run('install', ['--dest', preservedTarget]), /Run npm run build first/);
    assert.deepEqual(await readFile(join(destination, 'metadata.json')), installedMetadata);
    assert.equal(await readFile(join(preservedTarget, 'marker'), 'utf8'), 'keep me');
});
