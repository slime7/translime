import baseConfig from '../../eslint.config.base.mjs';

export default [
  ...baseConfig,
  {
    // win32 窗口样式与 SWP 标志位是位掩码运算，仅该模块放开
    files: ['src/win32.js'],
    rules: {
      'no-bitwise': ['error', { allow: ['|', '&', '~'] }],
    },
  },
];
