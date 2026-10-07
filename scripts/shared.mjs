import * as Files from 'node:fs/promises';
import * as Path from 'node:path';
import * as Url from 'node:url';

export const projectDirectory = Path.dirname(Path.dirname(Url.fileURLToPath(import.meta.url)));
export const distDirectory = Path.join(projectDirectory, 'dist');
export const releaseDirectory = Path.join(projectDirectory, 'releases');

// Resolve symlinked parents even when the final installation directory is new.
export async function canonicalPath(directory) {
    let current = Path.resolve(directory);
    const suffix = [];
    while (true) {
        try {
            return Path.join(await Files.realpath(current), ...suffix);
        } catch (error) {
            if (error.code !== 'ENOENT' || current === Path.dirname(current))
                throw error;
            suffix.unshift(Path.basename(current));
            current = Path.dirname(current);
        }
    }
}

export async function readBuild(directory) {
    try {
        const metadata = JSON.parse(await Files.readFile(Path.join(directory, 'metadata.json'), 'utf8'));
        if (!/^[\w.@+-]+$/.test(metadata.uuid ?? '') || metadata.uuid === '.' || metadata.uuid === '..')
            throw new Error('metadata.json must contain a valid extension UUID');

        const required = ['extension.js', 'prefs.js', 'stylesheet.css'];
        if (metadata['settings-schema'])
            required.push('schemas/gschemas.compiled');
        for (const file of required)
            await Files.access(Path.join(directory, file));
        return metadata;
    } catch (error) {
        throw new Error(`Invalid build at ${directory}. Run npm run build first. ${error.message}`);
    }
}

export async function listFiles(directory, prefix = '') {
    const files = [];
    const entries = await Files.readdir(directory, {withFileTypes: true});
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory())
            files.push(...await listFiles(Path.join(directory, entry.name), relative));
        else if (entry.isFile())
            files.push(relative);
        else
            throw new Error(`Unsupported build entry: ${relative}`);
    }
    return files;
}
