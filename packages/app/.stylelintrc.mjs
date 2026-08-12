import baseConfig from '../../stylelint.config.base.mjs';

/** @type {import('stylelint').Config} */
export default {
  ...baseConfig,
  overrides: [
    ...(baseConfig.overrides ?? []),
    {
      // Tailwind v4 方言（@theme/@utility/@custom-variant/@source、--breakpoint-* 通配符等）
      files: ['src/renderer/assets/styles/tailwind.css'],
      rules: {
        'at-rule-no-unknown': [true, {
          ignoreAtRules: ['theme', 'source', 'utility', 'custom-variant'],
        }],
        'custom-property-pattern': null,
        'number-max-precision': null,
        'length-zero-no-unit': null,
        'at-rule-empty-line-before': null,
        '@stylistic/declaration-colon-space-after': null,
        '@stylistic/block-opening-brace-space-before': null,
        '@stylistic/string-quotes': null,
      },
    },
    {
      // 纯 layer 顺序声明文件
      files: ['src/renderer/assets/styles/layers.css'],
      rules: {
        'at-rule-empty-line-before': null,
      },
    },
  ],
};
