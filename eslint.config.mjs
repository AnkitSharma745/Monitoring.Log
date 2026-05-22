import { defineConfig } from 'eslint/config';
import tseslint from '@electron-toolkit/eslint-config-ts';
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier';
import eslintPluginReact from 'eslint-plugin-react';
import eslintPluginReactHooks from 'eslint-plugin-react-hooks';
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh';
import eslintPluginImport from 'eslint-plugin-import';
import eslintPluginUnusedImports from 'eslint-plugin-unused-imports';
import eslintPluginPromise from 'eslint-plugin-promise';
import eslintPluginSecurity from 'eslint-plugin-security';

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out', 'scratch/**'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  eslintPluginSecurity.configs ? eslintPluginSecurity.configs.recommended : {},
  {
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh,
      import: eslintPluginImport,
      'unused-imports': eslintPluginUnusedImports,
      promise: eslintPluginPromise,
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      // Enterprise TypeScript Enforcements
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true }],
      '@typescript-eslint/no-unused-vars': 'off', // handled by unused-imports

      // Unused Imports & Clean Boundary Controls
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],

      // Import ordering determinism
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          pathGroups: [
            { pattern: '@shared/**', group: 'internal', position: 'before' },
            { pattern: '@main/**', group: 'internal', position: 'before' },
            { pattern: '@preload/**', group: 'internal', position: 'before' },
            { pattern: '@renderer/**', group: 'internal', position: 'before' },
          ],
          pathGroupsExcludedImportTypes: ['type'],
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // Safety and asynchronous logic
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'promise/always-return': 'off',
      'promise/catch-or-return': 'warn',
    },
  },
  eslintConfigPrettier,
);
