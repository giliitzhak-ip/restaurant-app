import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescriptConfig from 'eslint-config-next/typescript';

/**
 * Flat ESLint config. `next lint` was removed in Next 16, so `npm run lint`
 * calls ESLint directly and composes Next's own shareable flat configs.
 */
const config = [
  {
    ignores: ['node_modules/**', '.next/**', 'legacy/**', 'coverage/**', 'next-env.d.ts'],
  },
  ...coreWebVitals,
  ...typescriptConfig,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];

export default config;
