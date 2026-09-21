import next from "eslint-config-next";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Flat config. eslint-config-next 16 ships flat configs directly, so no
 * FlatCompat shim is needed.
 */
const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "legacy/**",
      "public/**",
      "next-env.d.ts",
      "src/generated/**",
      /*
       * Playwright's own output. Both are gitignored, but eslint's flat
       * config does not read .gitignore — so a developer who had just run the
       * e2e suite got 3,000 lint problems from trace viewer bundles that are
       * not this project's code.
       */
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...next,
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default eslintConfig;
