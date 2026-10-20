import {nodeResolve} from '@rollup/plugin-node-resolve';
import alias from '@rollup/plugin-alias';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(directory, 'src');
const input = {};
for (const kind of ['unit', 'integration']) {
    const root = path.join(src, 'tests', kind);
    if (!fs.existsSync(root)) continue;
    for (const area of fs.readdirSync(root)) {
        for (const file of fs.readdirSync(path.join(root, area))) {
            if (file.endsWith('.test.js'))
                input[`tests/${kind}/${area}/${file.slice(0, -3)}`] = path.join(root, area, file);
        }
    }
}

export default {
    input,
    output: {
        dir: 'dist-tests',
        format: 'es',
        preserveModules: true,
        preserveModulesRoot: 'src',
    },
    plugins: [
        alias({entries: [
            {find: '@girs/gnome-shell/ui/dash', replacement: 'resource:///org/gnome/shell/ui/dash.js'},
            {find: '@girs/gnome-shell/ui/grabHelper', replacement: 'resource:///org/gnome/shell/ui/grabHelper.js'},
            {find: '@', replacement: src},
        ]}),
        nodeResolve({browser: false, preferBuiltins: true}),
    ],
    external: id => !id.startsWith('@/') && !id.startsWith('.') && !path.isAbsolute(id),
};
