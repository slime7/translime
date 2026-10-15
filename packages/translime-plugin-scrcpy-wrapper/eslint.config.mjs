import baseConfig from '../../eslint.config.base.mjs';

export default [
  ...baseConfig,
  {
    // scrcpy 协议编解码（帧头标志位、定点数、keycode 掩码）依赖位运算，仅协议相关模块放开
    files: [
      'src/server/*.js',
      'src/ui/wrapper/keycode-map.js',
      'tests/control-message.test.js',
      'tests/video-frame-parser.test.js',
      'tests/keycode-map.test.js',
    ],
    rules: {
      'no-bitwise': ['error', { allow: ['|', '&', '~', '^', '<<', '>>', '>>>', '|=', '&=', '^=', '<<=', '>>='] }],
    },
  },
];
