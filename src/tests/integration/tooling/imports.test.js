import * as Assert from 'node:assert/strict';
import * as Files from 'node:fs/promises';
import * as Path from 'node:path';
import * as Url from 'node:url';
import * as Parser from 'rollup/parseAst';

const projectDirectory = process.cwd();

async function modules(directory) {
    const paths = [];
    for (const entry of await Files.readdir(directory, {withFileTypes: true})) {
        const path = Path.join(directory, entry.name);
        if (entry.isDirectory())
            paths.push(...await modules(path));
        else if (/\.(js|mjs)$/.test(entry.name))
            paths.push(path);
    }
    return paths;
}

it('source and tests use aliases and import only classes by name', async () => {
    const paths = [];
    for (const directory of ['src'])
        paths.push(...await modules(Path.join(projectDirectory, directory)));
    const declarations = new Map();
    for (const path of paths)
        declarations.set(path, Parser.parseAst(await Files.readFile(path, 'utf8')).body);

    for (const [path, body] of declarations) {
        for (const statement of body.filter(node => node.type === 'ImportDeclaration')) {
            const id = statement.source.value;
            Assert.ok(!id.startsWith('.'), `${path}: relative import ${id}`);
            Assert.ok(!id.startsWith('resource://'), `${path}: use @girs for ${id}`);
            for (const binding of statement.specifiers) {
                if (binding.type === 'ImportNamespaceSpecifier')
                    continue;
                // GI ESM modules expose their entire namespace as a default export.
                if (id.startsWith('gi://')) {
                    Assert.equal(binding.type, 'ImportDefaultSpecifier');
                    continue;
                }
                Assert.equal(binding.type, 'ImportSpecifier', `${path}: use a namespace for ${id}`);
                const target = id.startsWith('@/')
                    ? Path.join(projectDirectory, 'src', id.slice(2))
                    : Url.fileURLToPath(import.meta.resolve(id));
                if (id.startsWith('@girs/')) {
                    const types = await Files.readFile(target.replace(/\.js$/, '.d.ts'), 'utf8');
                    Assert.match(types, new RegExp(`export (?:declare )?class ${binding.imported.name}\\b`));
                } else {
                    const exports = declarations.get(target) ?? [];
                    Assert.ok(exports.some(node => node.type === 'ExportNamedDeclaration'
                        && node.declaration?.type === 'ClassDeclaration'
                        && node.declaration.id.name === binding.imported.name),
                    `${path}: ${binding.imported.name} must use a namespace import`);
                }
            }
        }
    }
});
