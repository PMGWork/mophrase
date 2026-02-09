import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default [
  // Ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/public/**',
      '**/.vite/**',
    ],
  },

  // Node.js
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // JavaScript
  js.configs.recommended,

  // TypeScript
  ...tseslint.configs.recommended,

  // Prettier
  prettierConfig,
];
