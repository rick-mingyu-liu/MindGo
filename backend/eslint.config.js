const js = require('@eslint/js');
const globals = require('globals');

/**
 * Flat config (ESLint 9). The backend is CommonJS Node, not bundled and not
 * transpiled, so there is no parser or plugin to configure.
 *
 * Deliberately not a style linter — formatting arguments are not worth a build
 * failure on an existing codebase. The rules below are the ones that catch
 * actual defects: references that do not resolve, bindings that are never used
 * (usually a leftover from a refactor, occasionally a typo'd variable), and
 * promise mistakes that fail silently at runtime.
 */
module.exports = [
  {
    ignores: ['node_modules/**', 'docs/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Unused function arguments are common and harmless in Express
      // middleware, where the signature is positional: an error handler must
      // declare (err, req, res, next) even when it ignores next. Unused
      // *variables* still fail, and a leading underscore opts an argument out.
      'no-unused-vars': ['error', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
        // `const { password_hash, ...safe } = user` is the idiomatic way to
        // drop a field before returning a row. The omitted names are the
        // point, so they are not "unused".
        ignoreRestSiblings: true,
      }],
      // An async function whose rejection nobody handles takes the process
      // down on an unhandled rejection.
      'no-async-promise-executor': 'error',
      // console is the logging mechanism in several services here, so it is
      // allowed rather than pretended otherwise.
      'no-console': 'off',
    },
  },
];
