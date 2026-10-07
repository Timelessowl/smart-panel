import * as Files from 'node:fs/promises';
import * as Path from 'node:path';
import * as Fflate from 'fflate';
import * as Build from '#scripts/shared.mjs';

try {
    const metadata = await Build.readBuild(Build.distDirectory);
    const entries = {};
    for (const file of await Build.listFiles(Build.distDirectory))
        entries[file] = await Files.readFile(Path.join(Build.distDirectory, file));

    await Files.mkdir(Build.releaseDirectory, {recursive: true});
    const archive = Path.join(Build.releaseDirectory, `${metadata.uuid}.shell-extension.zip`);
    await Files.writeFile(archive, Fflate.zipSync(entries, {level: 9}));
    console.log(`Packed extension to ${archive}`);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
