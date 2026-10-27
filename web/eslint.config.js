import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Only the two React hooks rules, on purpose. Type errors are tsc's job (`npm run lint`),
 * CSS classes and telemetry throw sites have their own checks, and a general style ruleset
 * would mostly add churn. These two catch bugs nothing else here does: a hook called
 * conditionally, and an effect or callback reading a value it does not list as a
 * dependency, so it keeps running with a stale copy.
 */
export default [
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
];
