module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true,
    browser: true,
  },
  extends: [
    'preact',
    'airbnb-base',
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  ignorePatterns: [
    'node_modules/**',
    '**/dist/**',
    'packages/rendererx/**',
  ],
  rules: {
    'import/extensions': ['error', 'always', {
      js: 'never',
      mjs: 'never',
      jsx: 'never',
      ts: 'never',
      tsx: 'never',
    }],
    'no-param-reassign': ['error', {
      props: true,
      ignorePropertyModificationsFor: [
        'acc', // for reduce accumulators
        'e', // for e.returnvalue
      ],
    }],
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'max-len': 'off',
    'no-async-promise-executor': 'off',
    'import/no-extraneous-dependencies': ['error', {
      devDependencies: true,
    }],
  },
};
