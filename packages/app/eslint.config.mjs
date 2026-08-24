import aliasResolver from 'eslint-import-resolver-alias';
import { createNodeResolver, importXResolverCompat } from 'eslint-plugin-import-x';
import baseConfig from '../../eslint.config.base.mjs';

const aliasResolverConfig = {
  map: [
    ['@pkg', './src'],
    ['@', './src/renderer'],
    ['@main', './src/main'],
    ['@share', './src/share'],
  ],
  extensions: ['.js', '.jsx', '.vue', '.json'],
};

export default [
  ...baseConfig,
  {
    files: ['src/**/*.js', 'src/**/*.vue', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    settings: {
      'import/resolver': {
        alias: aliasResolverConfig,
      },
      'import-x/resolver-next': [
        createNodeResolver(),
        importXResolverCompat(aliasResolver, aliasResolverConfig),
      ],
    },
    rules: {
      'import-x/namespace': 'off',
      'import-x/default': 'off',
      'import-x/no-named-as-default': 'off',
      'import-x/no-named-as-default-member': 'off',
      'import-x/no-rename-default': 'off',
    },
  },
  {
    files: ['tests/**/*.js'],
    rules: {
      'no-console': 'off',
      'import-x/extensions': 'off',
    },
  },
];
