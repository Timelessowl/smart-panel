import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
    {
        ...js.configs.recommended,
        files: ['src/**/*.js'],
        languageOptions: {
            globals: {...globals.node, ...globals.jasmine, global: 'readonly'},
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': ['error', {args: 'none', caughtErrors: 'none'}],
        },
    },
    prettier,
];
