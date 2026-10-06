import {access, readdir, readFile, realpath} from 'node:fs/promises';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
export const distDirectory = join(projectDirectory, 'dist');
export const releaseDirectory = join(projectDirectory, 'releases');

// Resolve symlinked parents even when the final installation directory is new.
export async function canonicalPath(directory) {
    let current = resolve(directory);
    const suffix = [];
    while (true) {
        try {
            return join(await realpath(current), ...suffix);
        } catch (error) {
            if (error.code !== 'ENOENT' || current === dirname(current))
                throw error;
            suffix.unshift(basename(current));
            current = dirname(current);
        }
    }
}

export async function readBuild(directory) {
    try {
        const metadata = JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8'));
        if (!/^[\w.@+-]+$/.test(metadata.uuid ?? '') || metadata.uuid === '.' || metadata.uuid === '..')
            throw new Error('metadata.json must contain a valid extension UUID');

        const required = ['extension.js', 'prefs.js', 'stylesheet.css'];
        if (metadata['settings-schema'])
            required.push('schemas/gschemas.compiled');
        for (const file of required)
            await access(join(directory, file));
        return metadata;
    } catch (error) {
        throw new Error(`Invalid build at ${directory}. Run npm run build first. ${error.message}`);
    }
}

export async function listFiles(directory, prefix = '') {
    const files = [];
    const entries = await readdir(directory, {withFileTypes: true});
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory())
            files.push(...await listFiles(join(directory, entry.name), relative));
        else if (entry.isFile())
            files.push(relative);
        else
            throw new Error(`Unsupported build entry: ${relative}`);
    }
    return files;
}
