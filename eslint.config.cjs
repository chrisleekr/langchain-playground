const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const jestPlugin = require('eslint-plugin-jest');
const importPlugin = require('eslint-plugin-import');
const prettierPlugin = require('eslint-plugin-prettier');

module.exports = [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'build/**',
      'data/repos/**',
      'CHANGELOG.md',
      'jest.config.*',
      'jest.setup.*',
      'release.config.*',
      '__mocks__/**'
    ]
  },
  // Special config for jest.config.ts without type checking
  {
    files: ['jest.config.ts', 'jest.setup.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022
      }
    },
    rules: {
      'no-console': 'off',
      'import/no-extraneous-dependencies': 'off'
    }
  },
  // Main TypeScript config
  {
    files: ['**/*.ts'],
    ignores: ['jest.config.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.build.json'],
        ecmaVersion: 2022
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      jest: jestPlugin,
      import: importPlugin,
      prettier: prettierPlugin
    },
    settings: {
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx']
      },
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json'
        }
      }
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...jestPlugin.configs.recommended.rules,
      ...importPlugin.configs.recommended.rules,
      'import/no-unresolved': 'error',
      'import/order': [
        'error',
        {
          groups: ['external', 'builtin', 'internal', 'sibling', 'parent', 'index']
        }
      ],
      'no-restricted-imports': ['error', { patterns: ['src/*'] }],
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: ['**/*.test.ts', 'jest.config.ts', 'test/**/*.ts']
        }
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      'import/no-named-as-default': 'off'
    }
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      'import/namespace': 'off'
    }
  },
  {
    files: ['src/api/**/*.ts'],
    rules: {
      'import/no-extraneous-dependencies': 'off'
    }
  }
];
