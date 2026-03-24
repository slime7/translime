import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = fileURLToPath(new URL('.', import.meta.url));

export default {
  root: dirname,
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
  resolve: {
    alias: {
      '@': resolve(dirname, 'src'),
    },
  },
};
