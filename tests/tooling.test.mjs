import * as Assert from 'node:assert/strict';
import * as ChildProcess from 'node:child_process';
import * as Files from 'node:fs/promises';
import * as OS from 'node:os';
import * as Path from 'node:path';
import * as Test from 'node:test';
import * as Util from 'node:util';
import * as Fflate from 'fflate';
import * as Build from '#scripts/shared.mjs';
import * as Stylesheet from '#tests/stylesheet.mjs';

const exec = Util.promisify(ChildProcess.execFile);
const uuid = 'simple-bottom-panel@local';
let fixture;
let distribution;

function run(script, args = [], env = {}) {
    return exec(process.execPath, [Path.join(fixture, 'scripts', `${script}.mjs`), ...args], {
        cwd: OS.tmpdir(), // Scripts must resolve paths relative to the project, not the caller.
        env: {...process.env, ...env},
    });
}

Test.before(async () => {
    fixture = await Files.mkdtemp(Path.join(OS.tmpdir(), 'panel-tooling-'));
    distribution = Path.join(fixture, 'dist');
    const directories = ['src', 'schemas', 'scripts'];
    for (const entry of await Files.readdir(Build.projectDirectory)) {
        if (directories.includes(entry) || /\.(js|mjs)$/.test(entry)
            || ['metadata.json', 'package.json'].includes(entry))
            await Files.cp(Path.join(Build.projectDirectory, entry), Path.join(fixture, entry), {recursive: true});
    }
    await Files.symlink(Path.join(Build.projectDirectory, 'node_modules'), Path.join(fixture, 'node_modules'), 'dir');
    await Files.mkdir(distribution);
    await Files.writeFile(Path.join(distribution, 'obsolete.js'), 'old module');
    await run('build');
});

Test.after(async () => {
    if (fixture)
        await Files.rm(fixture, {recursive: true, force: true});
});

Test.test('build produces GJS entry points, Sass output and a compiled schema without development files', async () => {
    const files = await Build.listFiles(distribution);
    Assert.deepEqual(files, [
        'extension.js', 'metadata.json', 'prefs.js',
        'schemas/gschemas.compiled', 'schemas/org.gnome.shell.extensions.simple-bottom-panel.gschema.xml',
        'stylesheet.css',
    ]);
    Assert.equal((await Files.readFile(Path.join(distribution, 'stylesheet.css'), 'utf8')).trim(), Stylesheet.stylesheet.trim());
    Assert.ok((await Files.readFile(Path.join(distribution, 'schemas/gschemas.compiled'))).length > 0);
    for (const entry of ['extension.js', 'prefs.js']) {
        const source = await Files.readFile(Path.join(distribution, entry), 'utf8');
        const imports = [...source.matchAll(/^import .*?from ['"]([^'"]+)['"]/gm)];
        Assert.ok(imports.length > 0);
        Assert.ok(imports.every(([, id]) => id.startsWith('gi://') || id.startsWith('resource://')));
        Assert.match(source, /export \{ .* as default \}/);
        await exec(process.execPath, ['--check', Path.join(distribution, entry)]);
    }
    const prefs = await Files.readFile(Path.join(distribution, 'prefs.js'), 'utf8');
    Assert.ok(!prefs.includes('gi://Shell'));
    Assert.ok(!prefs.includes('resource:///org/gnome/shell/ui/'));
    // Packaging and installation must use the built files even if source has changed.
    await Files.writeFile(Path.join(fixture, 'src/extension.js'), 'this source is deliberately invalid');
});

Test.test('pack archives the existing dist files at the ZIP root', async () => {
    await run('pack');
    const archive = await Files.readFile(Path.join(fixture, 'releases', `${uuid}.shell-extension.zip`));
    const entries = Fflate.unzipSync(archive);
    const files = await Build.listFiles(distribution);
    Assert.deepEqual(Object.keys(entries).sort(), [...files].sort());
    for (const file of files)
        Assert.deepEqual(Buffer.from(entries[file]), await Files.readFile(Path.join(distribution, file)));
});

Test.test('install respects XDG_DATA_HOME, supports an explicit target and removes obsolete files', async () => {
    const dataDirectory = Path.join(fixture, 'local-data');
    const destination = Path.join(dataDirectory, 'gnome-shell/extensions', uuid);
    await run('install', [], {XDG_DATA_HOME: dataDirectory});
    await Files.writeFile(Path.join(destination, 'obsolete.js'), 'obsolete');
    await run('install', ['--dest', destination]);
    const files = await Build.listFiles(distribution);
    Assert.deepEqual(await Build.listFiles(destination), files);
    for (const file of files)
        Assert.deepEqual(await Files.readFile(Path.join(destination, file)), await Files.readFile(Path.join(distribution, file)));
    const explicitTarget = Path.join(fixture, 'other-install');
    await run('install', ['--dest', explicitTarget]);
    Assert.deepEqual(await Build.listFiles(explicitTarget), files);
});

Test.test('pack and install reject an incomplete build without touching an existing installation', async () => {
    const destination = Path.join(fixture, 'other-install');
    const installedMetadata = await Files.readFile(Path.join(destination, 'metadata.json'));
    await Assert.rejects(run('install', ['--dest', fixture]), /separate from the build/);
    const preservedTarget = Path.join(fixture, 'preserved-target');
    await Files.mkdir(preservedTarget);
    await Files.writeFile(Path.join(preservedTarget, 'marker'), 'keep me');
    await Files.rm(Path.join(distribution, 'stylesheet.css'));
    await Assert.rejects(run('pack'), /Run npm run build first/);
    await Assert.rejects(run('install', ['--dest', destination]), /Run npm run build first/);
    await Assert.rejects(run('install', ['--dest', preservedTarget]), /Run npm run build first/);
    Assert.deepEqual(await Files.readFile(Path.join(destination, 'metadata.json')), installedMetadata);
    Assert.equal(await Files.readFile(Path.join(preservedTarget, 'marker'), 'utf8'), 'keep me');
});
