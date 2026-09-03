import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import eslintConfigPrettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/out-tsc/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/.venv/**',
      '**/.uv-cache/**',
      '**/.turbo/**',
      '**/.pytest_cache/**',
      '**/__pycache__/**',
      '**/.ruff_cache/**',
      '**/.mypy_cache/**',
      '**/.fallow/**',
      '**/.tmp-railway-cli/**',
      '**/coverage/**',
      '**/snapshot.json',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  js.configs.recommended,
  // Industry baseline: strict + stylistic (non-type-checked, fast).
  // Type-checked rules (recommendedTypeChecked) are a future step —
  // they need parserOptions.projectService + full tsconfig coverage.
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    plugins: {
      'react-hooks': reactHooks,
      import: importPlugin,
    },
    settings: {
      react: { version: 'detect' },
      // NOTE: no import resolver installed (no eslint-import-resolver-typescript),
      // so import/no-unresolved is intentionally NOT enabled (would false-positive on @/ aliases).
    },
    rules: {
      // React hooks — industry standard
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Import hygiene (resolver-free, auto-fixable where possible)
      'import/no-duplicates': 'warn',
      'import/no-self-import': 'error',
      'import/no-cycle': ['warn', { maxDepth: 1 }],
      'import/no-mutable-exports': 'error',
      'import/no-unused-modules': 'off',
      'import/first': 'warn',
      'import/newline-after-import': 'warn',
      'import/order': [
        'warn',
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
            { pattern: 'react', group: 'external', position: 'before' },
            { pattern: 'next/**', group: 'external', position: 'before' },
            { pattern: '@applyso/**', group: 'internal', position: 'before' },
            { pattern: '@/**', group: 'internal', position: 'before' },
          ],
          pathGroupsExcludedImportTypes: ['react', 'next'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // Core quality gates
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'all'],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': ['warn', 'always'],
      'prefer-arrow-callback': ['warn', { allowNamedFunctions: true }],
      'no-nested-ternary': 'off',
      'no-param-reassign': 'off',
      'no-return-await': 'off',
      'no-await-in-loop': 'off',

      // TypeScript specifics
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // only-throw-error needs type info (projectService); use core rule instead
      '@typescript-eslint/only-throw-error': 'off',
      'no-throw-literal': 'error',
      // Stylistic preference, not a correctness gate — allow both `type` and
      // `interface` to avoid churning dither-kit (29 hits). Revisit if team prefers one.
      '@typescript-eslint/consistent-type-definitions': 'off',
      // Needs refactor (delete obj[key] -> destructure/Map); warn until fixed
      '@typescript-eslint/no-dynamic-delete': 'warn',
      // Accessibility: keep visible, fix incrementally (5 files, 16 hits)
      'jsx-a11y/label-has-associated-control': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      '@typescript-eslint/no-empty-object-type': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    files: ['**/*.mjs', '**/*.cjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: [
      'tests/**/*.{ts,tsx}',
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      'scripts/**/*.{ts,mjs,js}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      'import/no-cycle': 'off',
    },
  },
  eslintConfigPrettier,
];
