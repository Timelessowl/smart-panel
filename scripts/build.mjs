import {rollup} from 'rollup';
import config from '../rollup.config.mjs';

try {
    const bundle = await rollup(config);
    try {
        await bundle.write(config.output);
        console.log(`Built extension in ${config.output.dir}`);
    } finally {
        await bundle.close();
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
