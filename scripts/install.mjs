import * as Files from 'node:fs/promises';
import * as OS from 'node:os';
import * as Path from 'node:path';
import * as Util from 'node:util';
import * as Build from '#scripts/shared.mjs';

try {
    const {values} = Util.parseArgs({options: {dest: {type: 'string'}}});
    const metadata = await Build.readBuild(Build.distDirectory);
    await Build.listFiles(Build.distDirectory); // Reject symlinks before copying the build.
    const dataDirectory = process.env.XDG_DATA_HOME || Path.join(OS.homedir(), '.local/share');
    const destination = values.dest ? Path.resolve(values.dest)
        : Path.join(dataDirectory, 'gnome-shell/extensions', metadata.uuid);
    const targetPath = await Build.canonicalPath(destination);
    const buildPath = await Build.canonicalPath(Build.distDirectory);
    if (targetPath === buildPath || buildPath.startsWith(`${targetPath}/`)
        || targetPath.startsWith(`${buildPath}/`) || targetPath === Path.resolve('/'))
        throw new Error('Installation destination must be separate from the build directory.');

    await Files.mkdir(Path.dirname(destination), {recursive: true});
    const staging = await Files.mkdtemp(Path.join(Path.dirname(destination), `.${metadata.uuid}-`));
    const replacement = Path.join(staging, 'extension');
    const backup = Path.join(staging, 'previous');
    let previousExists = false;
    let backupNeedsRecovery = false;
    try {
        await Files.cp(Build.distDirectory, replacement, {recursive: true});
        try {
            const previous = await Files.lstat(destination);
            if (!previous.isDirectory() || previous.isSymbolicLink())
                throw new Error('Installation destination must be a directory, not a symlink.');
            previousExists = true;
        } catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
        if (previousExists) {
            await Files.rename(destination, backup);
            backupNeedsRecovery = true;
        }
        try {
            await Files.rename(replacement, destination);
            backupNeedsRecovery = false;
        } catch (error) {
            if (previousExists) {
                await Files.rename(backup, destination);
                backupNeedsRecovery = false;
            }
            throw error;
        }
    } finally {
        if (backupNeedsRecovery)
            console.error(`Previous installation preserved at ${backup}`);
        else
            await Files.rm(staging, {recursive: true, force: true});
    }
    console.log(`Installed ${metadata.uuid} to ${destination}`);
    console.log(`Enable: gnome-extensions enable ${metadata.uuid}`);
    console.log(`Preferences: gnome-extensions prefs ${metadata.uuid}`);
    console.log('Restart GNOME Shell with Alt+F2, then r on X11; log out and back in on Wayland.');
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
