/** @type {import('stylelint').Config} */
export default {
  customSyntax: 'postcss-scss',
  extends: [
    'stylelint-config-standard-scss', // SCSS 标准规则
    'stylelint-config-recommended-vue/scss', // Vue SFC 中的 SCSS 支持
  ],
  plugins: [
    '@stylistic/stylelint-plugin', // 必须：用于解析旧版本的样式规则
  ],
  rules: {
    // 合并用户提供的规则，并适配为最新的 @stylistic 前缀
    '@stylistic/indentation': 2,
    'rule-empty-line-before': [
      'always',
      {
        except: ['first-nested', 'after-single-line-comment'],
      },
    ],
    '@stylistic/selector-list-comma-newline-after': 'always',
    '@stylistic/selector-list-comma-newline-before': 'never-multi-line',
    '@stylistic/selector-list-comma-space-before': 'never',
    '@stylistic/value-list-comma-space-after': 'always',
    'declaration-empty-line-before': ['never', {}],
    '@stylistic/color-hex-case': 'lower',
    'length-zero-no-unit': true,
    'color-hex-length': 'short',
    'comment-whitespace-inside': 'always',
    '@stylistic/string-quotes': 'single',
    '@stylistic/declaration-colon-space-after': 'always',
    '@stylistic/declaration-colon-space-before': 'never',
    '@stylistic/property-case': 'lower',
    'selector-type-case': 'lower',
    '@stylistic/media-feature-parentheses-space-inside': 'never',
    '@stylistic/block-opening-brace-space-before': 'always',
    '@stylistic/block-opening-brace-newline-after': 'always-multi-line',
    '@stylistic/block-closing-brace-newline-before': 'always-multi-line',
    '@stylistic/block-closing-brace-empty-line-before': 'never',
    '@stylistic/no-extra-semicolons': true,
    '@stylistic/number-leading-zero': 'never',
    '@stylistic/no-empty-first-line': true,
    'no-empty-source': null,
    '@stylistic/no-eol-whitespace': true,
    '@stylistic/declaration-block-semicolon-newline-after': 'always-multi-line',
    '@stylistic/declaration-block-semicolon-space-after': 'always-single-line',
    '@stylistic/declaration-block-semicolon-space-before': 'never',
    '@stylistic/selector-combinator-space-before': 'always',
    '@stylistic/selector-combinator-space-after': 'always',

    // 基础覆盖设定
    'scss/at-import-partial-extension': null,
    'selector-class-pattern': null,
    'no-descending-specificity': null,
  },
  overrides: [
    {
      files: ['**/*.{vue,html}'],
      customSyntax: 'postcss-html',
    },
  ],
};
