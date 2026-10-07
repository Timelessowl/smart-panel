import * as Rollup from 'rollup';
import * as RollupConfig from '#rollup';

try {
    const bundle = await Rollup.rollup(RollupConfig.default);
    try {
        await bundle.write(RollupConfig.default.output);
        console.log(`Built extension in ${RollupConfig.default.output.dir}`);
    } finally {
        await bundle.close();
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
