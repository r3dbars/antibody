// The deterministic half of CI: `npm run lint`. Kept intentionally close to
// eslint's recommended set — style is enforced by convention and review, the
// linter only catches real mistakes.
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // The review UI is a single static HTML file; its inline script is exercised
  // by hand and by the browser, not by eslint.
  { ignores: ['ui/', 'node_modules/'] },
];
