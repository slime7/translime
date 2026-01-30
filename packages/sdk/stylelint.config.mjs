import baseConfig from '../../stylelint.config.base.mjs';

/** @type {import('stylelint').Config} */
export default {
  ...baseConfig,
  overrides: [
    {
      files: ['src/**/*.{vue,html}'],
      customSyntax: 'postcss-html',
    },
  ],
};
