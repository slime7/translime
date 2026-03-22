import { resolve } from 'node:path';

export default {
  root: __dirname,
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
};
