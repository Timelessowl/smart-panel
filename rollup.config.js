/* eslint-env node */
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import scss from 'rollup-plugin-scss';
import copy from 'rollup-plugin-copy';
import alias from '@rollup/plugin-alias';
import {execSync} from 'child_process';
import zip from 'rollup-plugin-zipdir';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const SHOULD_PACKAGE = Boolean(process.env.package);
const DIST_FOLDER = 'dist';
const BUILD_FOLDER = 'build';
const SRC_EXTENSION = 'src/extension';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const generateMetadata = () => {
    const metadata = {
        uuid: pkg.uuid,
        name: pkg.displayName || pkg.name,
        description: pkg.description,
        version: pkg.version,
        'shell-version': pkg.shellVersions ||
            pkg['shell-version'] || ['45', '46', '47', '48'],
    };

    if (pkg['settings-schema'])
        metadata['settings-schema'] = pkg['settings-schema'];
    if (pkg['gettext-domain'])
        metadata['gettext-domain'] = pkg['gettext-domain'];

    const metadataPath = path.join(DIST_FOLDER, 'metadata.json');
    fs.mkdirSync(DIST_FOLDER, {recursive: true});
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    if (fs.existsSync(metadataPath))
        console.log('metadata.json generated at:', metadataPath);
    else console.error('metadata.json file was not created!');

    return metadata;
};

export default {
    input: {
        extension: path.join(SRC_EXTENSION, 'extension.js'),
        prefs: path.join(SRC_EXTENSION, 'prefs.js'),
    },
    output: {
        dir: DIST_FOLDER,
        format: 'es',
        preserveModules: true,
        exports: 'named',
    },
    plugins: [
        alias({
            entries: [
                {find: '@girs/gnome-shell/ui/dash', replacement: 'resource:///org/gnome/shell/ui/dash.js'},
                {find: '@', replacement: path.resolve(__dirname, 'src')},
            ],
        }),
        nodeResolve({
            browser: false,
            preferBuiltins: false,
        }),
        scss({
            fileName: 'stylesheet.css',
            failOnError: true,
            indentType: 'tab',
            indentWidth: 1,
            silenceDeprecations: ['legacy-js-api'],
        }),
        commonjs(),
        {
            name: 'generate-metadata',
            buildStart() {
                generateMetadata();
            },
        },
        copy({
            targets: [
                {
                    src: path.join(SRC_EXTENSION, 'schemas/**/*'),
                    dest: path.join(DIST_FOLDER, 'schemas'),
                },
                {
                    src: path.join(SRC_EXTENSION, 'assets'),
                    dest: DIST_FOLDER,
                },
                {
                    src: path.join(SRC_EXTENSION, 'po/**/*'),
                    dest: path.join(DIST_FOLDER, 'po'),
                },
            ],
            hook: 'buildStart',
        }),
        {
            name: 'compile-schemas',
            buildEnd() {
                try {
                    console.log('Compiling GSettings schemas...');
                    execSync(
                        `glib-compile-schemas ${path.join(DIST_FOLDER, 'schemas')}`,
                        {stdio: 'inherit'}
                    );
                    console.log('GSettings schemas compiled successfully');
                } catch (error) {
                    console.error(
                        'Failed to compile GSettings schemas:',
                        error
                    );
                    process.exit(1);
                }
            },
        },
        SHOULD_PACKAGE &&
            zip({
                name: `${pkg.name}.v${pkg.version}.shell-extension.zip`,
                outputDir: BUILD_FOLDER,
            }),
    ],
    external: id => {
        return (
            id.startsWith('gi://') ||
            id.startsWith('resource://') ||
            id === 'system' ||
            id === 'cairo' ||
            id === 'gettext'
        );
    },
};
