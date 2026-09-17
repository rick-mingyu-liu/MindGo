import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Flat config (ESLint 9). The backend is being converted from CommonJS
 * JavaScript to TypeScript (docs/superpowers/specs/2026-09-17-backend-typescript-design.md);
 * until that finishes, both kinds of file are linted, each with its own parser.
 *
 * Deliberately not a style linter — formatting arguments are not worth a build
 * failure on an existing codebase. The rules below are the ones that catch
 * actual defects: references that do not resolve, bindings that are never used
 * (usually a leftover from a refactor, occasionally a typo'd variable), and
 * promise mistakes that fail silently at runtime.
 */
const unusedVars = ['error', {
  // Unused function arguments are common and harmless in Express
  // middleware, where the signature is positional: an error handler must
  // declare (err, req, res, next) even when it ignores next. Unused
  // *variables* still fail, and a leading underscore opts an argument out.
  args: 'after-used',
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
  caughtErrors: 'none',
  // `const { password_hash, ...safe } = user` is the idiomatic way to
  // drop a field before returning a row. The omitted names are the
  // point, so they are not "unused".
  ignoreRestSiblings: true,
}];

export default defineConfig(
  {
    ignores: ['node_modules/**', 'dist/**', 'docs/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': unusedVars,
      // An async function whose rejection nobody handles takes the process
      // down on an unhandled rejection.
      'no-async-promise-executor': 'error',
      // console is the logging mechanism in several services here, so it is
      // allowed rather than pretended otherwise.
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': unusedVars,
      // `import x = require('./x')` is how TypeScript imports a module that
      // keeps its `module.exports = value` shape (spec §4.1).
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-async-promise-executor': 'error',
      'no-console': 'off',
    },
  },
);
