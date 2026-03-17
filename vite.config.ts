import { defineConfig } from 'vite-plus';

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  lint: {
    plugins: ['oxc', 'typescript', 'unicorn', 'react'],
    ignorePatterns: [
      'apps/worker/worker-configuration.d.ts',
      '.vscode/',
      '.agent/',
      '.codex/',
      'docs/',
      'vite.config.ts',
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    sortTailwindcss: {},
    sortPackageJson: false,
    singleQuote: true,
    printWidth: 80,
    ignorePatterns: [
      'apps/worker/worker-configuration.d.ts',
      '.vscode/',
      '.agent/',
      '.codex/',
      'docs/',
      'vite.config.ts',
    ],
  },
});
