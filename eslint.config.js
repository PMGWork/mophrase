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
      '**/.codex/**',
      'AGENTS.md',
      'docs/**',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'worker/.wrangler/**',
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

  // Project rules
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
      ],
    },
  },

  // Prettier
  prettierConfig,
];
