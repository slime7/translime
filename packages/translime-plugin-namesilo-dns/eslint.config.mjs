import react from 'eslint-plugin-react';
import baseConfig from '../../eslint.config.base.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.jsx'],
    plugins: {
      react,
    },
    rules: {
      'react/jsx-uses-vars': 'error',
    },
  },
];
