import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Flat config (ESLint 9). The backend is TypeScript throughout
 * (docs/superpowers/specs/2026-09-17-backend-typescript-design.md), so the only
 * file-specific block left is the TypeScript one. A .js file appearing under
 * backend/ again would get nothing but the base recommended rules, which is the
 * signal that it should have been .ts.
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
      // An async function whose rejection nobody handles takes the process
      // down on an unhandled rejection.
      'no-async-promise-executor': 'error',
      // console is the logging mechanism in several services here, so it is
      // allowed rather than pretended otherwise.
      'no-console': 'off',
    },
  },
);
