import baseConfig from '../../eslint.config.base.mjs';

export default [
  ...baseConfig,
  {
    settings: {
      'import/resolver': {
        alias: {
          map: [['@pkg', './src'], ['@', './src/renderer']],
          extensions: ['.js', '.jsx', '.vue', '.json'],
        },
      },
    },
  },
];
