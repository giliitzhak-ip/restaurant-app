import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'coverage', 'playwright-report', 'test-results', 'docs/screenshots'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always'],
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'localStorage הוא לא מסד הנתונים הראשי — יש להשתמש ב-IndexedDB (src/lib/db).' },
      ],
      // no-restricted-globals לא תופס window.localStorage, ולכן גם זה נחסם.
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'localStorage',
          message: 'localStorage הוא לא מסד הנתונים הראשי — יש להשתמש ב-IndexedDB (src/lib/db).',
        },
        {
          object: 'globalThis',
          property: 'localStorage',
          message: 'localStorage הוא לא מסד הנתונים הראשי — יש להשתמש ב-IndexedDB (src/lib/db).',
        },
      ],
    },
  },
  {
    // The one place allowed to read the legacy localStorage payload is the importer.
    files: ['src/features/legacyImport/**/*.ts', 'src/features/legacyImport/**/*.tsx'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },
  {
    // סקריפטים ב-JavaScript רץ ב-Node: אין להם את ה-globals של הבלוק שלמעלה.
    files: ['**/*.{mjs,js}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } },
  },
  {
    files: ['scripts/**/*.{ts,mjs,js}', 'server/**/*.ts', 'tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // בדיקות E2E מזריקות session לדפדפן — שם localStorage הוא הכלי הנכון.
    files: ['tests/e2e/**/*.ts'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },
);
