import baseConfig from '../../eslint.config.base.mjs';

export default [
  ...baseConfig,
  {
    // preview mock 运行在浏览器环境：console 是预览诊断通道，confirm 是预览交互的兜底实现
    files: ['src/preview-mock.js', 'src/preview/**/*.js'],
    rules: {
      'no-console': 'off',
      'no-alert': 'off',
    },
  },
];
