import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'public/icons', 'coverage', '**/*.local.*'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    // The authoritative server is a Node process: its log lines are the only
    // operational signal it has, so stdout is allowed there and nowhere else.
    files: ['src/server/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Node build scripts and this config file are not part of the app's TS project.
    files: ['scripts/**/*.mjs', 'e2e/**/*.mjs', 'eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        document: 'readonly',
        window: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
  prettier,
);
