import {execFile} from 'node:child_process';
import {readdir, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {promisify} from 'node:util';
import sass from 'rollup-plugin-sass';
import {distDirectory, projectDirectory} from './scripts/shared.mjs';

const run = promisify(execFile);

export function createConfig(directory = distDirectory) {
    let stylesheet;

    return {
        input: {
            extension: join(projectDirectory, 'scripts/extension.mjs'),
            prefs: join(projectDirectory, 'prefs.js'),
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
            {
                name: 'clean-dist',
                async buildStart() {
                    await rm(directory, {recursive: true, force: true});
                },
            },
            sass({
                api: 'modern',
                options: {style: 'expanded'},
                output(css) { stylesheet = css; },
            }),
            {
                name: 'extension-assets',
                async generateBundle() {
                    this.emitFile({type: 'asset', fileName: 'stylesheet.css', source: stylesheet});
                    const schemaDirectory = join(projectDirectory, 'schemas');
                    const schemas = (await readdir(schemaDirectory))
                        .filter(file => file.endsWith('.gschema.xml')).sort();
                    for (const fileName of ['metadata.json', ...schemas.map(file => `schemas/${file}`)]) {
                        const sourcePath = join(projectDirectory, fileName);
                        this.addWatchFile(sourcePath);
                        this.emitFile({type: 'asset', fileName, source: await readFile(sourcePath)});
                    }
                },
                async writeBundle() {
                    try {
                        await run('glib-compile-schemas', ['--strict', join(directory, 'schemas')]);
                    } catch (error) {
                        this.error(`Cannot compile GSettings schemas. Install GLib's glib-compile-schemas. ${error.stderr || error.message}`);
                    }
                },
            },
        ],
    };
}

export default createConfig();
