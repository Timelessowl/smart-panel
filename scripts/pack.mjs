import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {zipSync} from 'fflate';
import {distDirectory, listFiles, readBuild, releaseDirectory} from './shared.mjs';

try {
    const metadata = await readBuild(distDirectory);
    const entries = {};
    for (const file of await listFiles(distDirectory))
        entries[file] = await readFile(join(distDirectory, file));

    await mkdir(releaseDirectory, {recursive: true});
    const archive = join(releaseDirectory, `${metadata.uuid}.shell-extension.zip`);
    await writeFile(archive, zipSync(entries, {level: 9}));
    console.log(`Packed extension to ${archive}`);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
