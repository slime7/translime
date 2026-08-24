import globals from 'globals';
import babelParser from '@babel/eslint-parser';
import * as airbnbExtended from 'eslint-config-airbnb-extended';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

export default [
  {
    ignores: ['node_modules/**/*', '**/dist/**/*', 'packages/rendererx/**/*', '**/*.d.ts'],
  },
  ...vue.configs['flat/strongly-recommended'],
  airbnbExtended.plugins.stylistic,
  ...airbnbExtended.configs.base.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parser: babelParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          plugins: [
            '@babel/plugin-syntax-jsx',
            '@babel/plugin-syntax-import-attributes',
          ],
        },
      },
    },
    plugins: {
      ...airbnbExtended.plugins.stylistic.plugins,
      ...airbnbExtended.plugins.importX.plugins,
      vue,
    },
    rules: {
      semi: ['error', 'always'],
      'semi-spacing': ['error', { before: false, after: true }],
      quotes: ['error', 'single', { avoidEscape: true }],
      indent: ['error', 2, { SwitchCase: 0 }],
      '@stylistic/indent': ['error', 2, { SwitchCase: 0 }],
      'keyword-spacing': ['error', {
        before: true,
        after: true,
        overrides: {
          return: { after: true },
          throw: { after: true },
          case: { after: true },
        },
      }],
      'comma-dangle': ['error', {
        arrays: 'always-multiline',
        objects: 'always-multiline',
        imports: 'always-multiline',
        exports: 'always-multiline',
        functions: 'always-multiline',
      }],
      'object-curly-spacing': ['error', 'always'],
      'space-before-function-paren': ['error', {
        anonymous: 'always',
        named: 'never',
        asyncArrow: 'always',
      }],
      'space-unary-ops': ['error', { words: true, nonwords: false }],
      'space-in-parens': ['error', 'never'],
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
      'quote-props': ['error', 'as-needed', {
        keywords: false,
        unnecessary: true,
        numbers: false,
      }],
      '@stylistic/max-len': 'off',
      'import-x/no-commonjs': [0],
      'import-x/no-extraneous-dependencies': ['off'],
      'no-multi-spaces': ['error', { ignoreEOLComments: false }],
      'no-trailing-spaces': ['error'],
      'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 1 }],
      'sort-imports': ['warn', { ignoreCase: true, ignoreDeclarationSort: true }],
      'vue/multi-word-component-names': 'off',
      'vue/html-button-has-type': 'off',
      'vue/max-len': 'off',
      'vue/max-attributes-per-line': ['error', {
        singleline: { max: 5 },
        multiline: { max: 1 },
      }],
      'max-len': 'off',
      'no-unsafe-optional-chaining': 'off',
      // 插件样式隔离有意扩展 Promise.prototype.then 以传播插件上下文
      'no-extend-native': ['error', { exceptions: ['Promise'] }],
      'vuejs-accessibility/form-control-has-label': 'off',
      'vuejs-accessibility/label-has-for': 'off',
      'no-param-reassign': ['error', {
        props: true,
        ignorePropertyModificationsFor: ['state', 'acc', 'e', 'element', 'el'],
      }],
      'import-x/no-cycle': 'warn',
    },
  },
  {
    files: ['**/*.mjs'],
    rules: {
      'import-x/extensions': 'off',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: babelParser,
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          plugins: [
            '@babel/plugin-syntax-jsx',
            '@babel/plugin-syntax-import-attributes',
          ],
        },
      },
    },
  },
  {
    files: ['**/src/preview/entry-template.js'],
    rules: {
      'import-x/no-unresolved': 'off',
    },
  },
];
