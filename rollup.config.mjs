import * as ChildProcess from 'node:child_process';
import * as Files from 'node:fs/promises';
import * as Path from 'node:path';
import * as Util from 'node:util';
import * as SassPlugin from 'rollup-plugin-sass';
import * as AliasPlugin from '@rollup/plugin-alias';
import * as NodeResolve from '@rollup/plugin-node-resolve';
import * as Build from '#scripts/shared.mjs';

const run = Util.promisify(ChildProcess.execFile);

export function createConfig(directory = Build.distDirectory) {
    let stylesheet;

    return {
        input: {
            extension: Path.join(Build.projectDirectory, 'src/extension.js'),
            prefs: Path.join(Build.projectDirectory, 'src/prefs.js'),
        },
        external: id => id.startsWith('gi://') || id.startsWith('resource://'),
        onwarn(warning, warn) {
            if (warning.code === 'UNRESOLVED_IMPORT')
                throw new Error(warning.message);
            warn(warning);
        },
        output: {
            dir: directory,
            format: 'es',
            entryFileNames: '[name].js',
            chunkFileNames: 'chunks/[name]-[hash].js',
        },
        plugins: [
            AliasPlugin.default({entries: [{find: '@', replacement: Path.join(Build.projectDirectory, 'src')}]}),
            NodeResolve.nodeResolve(),
            {
                name: 'clean-dist',
                async buildStart() {
                    await Files.rm(directory, {recursive: true, force: true});
                },
            },
            SassPlugin.default({
                api: 'modern',
                options: {style: 'expanded'},
                output(css) { stylesheet = css; },
            }),
            {
                name: 'extension-assets',
                async generateBundle() {
                    this.emitFile({type: 'asset', fileName: 'stylesheet.css', source: stylesheet});
                    const schemaDirectory = Path.join(Build.projectDirectory, 'schemas');
                    const schemas = (await Files.readdir(schemaDirectory))
                        .filter(file => file.endsWith('.gschema.xml')).sort();
                    for (const fileName of ['metadata.json', ...schemas.map(file => `schemas/${file}`)]) {
                        const sourcePath = Path.join(Build.projectDirectory, fileName);
                        this.addWatchFile(sourcePath);
                        this.emitFile({type: 'asset', fileName, source: await Files.readFile(sourcePath)});
                    }
                },
                async writeBundle() {
                    try {
                        await run('glib-compile-schemas', ['--strict', Path.join(directory, 'schemas')]);
                    } catch (error) {
                        this.error(`Cannot compile GSettings schemas. Install GLib's glib-compile-schemas. ${error.stderr || error.message}`);
                    }
                },
            },
        ],
    };
}

export default createConfig();
