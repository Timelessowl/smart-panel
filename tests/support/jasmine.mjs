export default {
    spec_dir: 'tests',
    spec_files: ['**/*.spec.mjs'],
    helpers: [],
    env: {
        random: true,
        failSpecWithNoExpectations: true,
        stopSpecOnExpectationFailure: true,
    },
};
