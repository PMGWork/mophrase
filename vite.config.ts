import { defineConfig } from 'vite-plus';

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  lint: {
    plugins: ['oxc', 'typescript', 'unicorn', 'react'],
    ignorePatterns: [
      '**/node_modules/**',
      '**/dist/**',
      '**/public/**',
      '**/.vite/**',
      '**/.wrangler/**',
      '**/.codex/**',
      '.vscode/**',
      'apps/worker/worker-configuration.d.ts',
      'AGENTS.md',
      'docs/**',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    sortTailwindcss: {},
    singleQuote: true,
    printWidth: 80,
    sortPackageJson: false,
    ignorePatterns: [
      '**/node_modules/**',
      '**/dist/**',
      '**/public/**',
      '**/.vite/**',
      '**/.wrangler/**',
      '.vscode/**',
      'apps/worker/worker-configuration.d.ts',
      '.agent/',
      '.codex/',
      'AGENTS.md',
      'docs/',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
    ],
  },
});
