import * as Module from 'node:module';

const sourceDirectory = new URL('../src/', import.meta.url);

// Node tests use the same source alias as Rollup and TypeScript.
Module.registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier.startsWith('@/'))
            return nextResolve(new URL(specifier.slice(2), sourceDirectory).href, context);
        return nextResolve(specifier, context);
    },
});
