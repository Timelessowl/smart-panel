import {cp, lstat, mkdir, mkdtemp, rename, rm} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {canonicalPath, distDirectory, listFiles, readBuild} from './shared.mjs';

try {
    const {values} = parseArgs({options: {dest: {type: 'string'}}});
    const metadata = await readBuild(distDirectory);
    await listFiles(distDirectory); // Reject symlinks before copying the build.
    const dataDirectory = process.env.XDG_DATA_HOME || join(homedir(), '.local/share');
    const destination = values.dest ? resolve(values.dest)
        : join(dataDirectory, 'gnome-shell/extensions', metadata.uuid);
    const targetPath = await canonicalPath(destination);
    const buildPath = await canonicalPath(distDirectory);
    if (targetPath === buildPath || buildPath.startsWith(`${targetPath}/`)
        || targetPath.startsWith(`${buildPath}/`) || targetPath === resolve('/'))
        throw new Error('Installation destination must be separate from the build directory.');

    await mkdir(dirname(destination), {recursive: true});
    const staging = await mkdtemp(join(dirname(destination), `.${metadata.uuid}-`));
    const replacement = join(staging, 'extension');
    const backup = join(staging, 'previous');
    let previousExists = false;
    let backupNeedsRecovery = false;
    try {
        await cp(distDirectory, replacement, {recursive: true});
        try {
            const previous = await lstat(destination);
            if (!previous.isDirectory() || previous.isSymbolicLink())
                throw new Error('Installation destination must be a directory, not a symlink.');
            previousExists = true;
        } catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
        if (previousExists) {
            await rename(destination, backup);
            backupNeedsRecovery = true;
        }
        try {
            await rename(replacement, destination);
            backupNeedsRecovery = false;
        } catch (error) {
            if (previousExists) {
                await rename(backup, destination);
                backupNeedsRecovery = false;
            }
            throw error;
        }
    } finally {
        if (backupNeedsRecovery)
            console.error(`Previous installation preserved at ${backup}`);
        else
            await rm(staging, {recursive: true, force: true});
    }
    console.log(`Installed ${metadata.uuid} to ${destination}`);
    console.log(`Enable: gnome-extensions enable ${metadata.uuid}`);
    console.log(`Preferences: gnome-extensions prefs ${metadata.uuid}`);
    console.log('Restart GNOME Shell with Alt+F2, then r on X11; log out and back in on Wayland.');
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
