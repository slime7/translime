import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  mode: 'production',
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@pkg': resolve(dirname, 'src'),
      '@': resolve(dirname, 'src/renderer'),
      '@main': resolve(dirname, 'src/main'),
      '@share': resolve(dirname, 'src/share'),
    },
  },
  define: {
    'import.meta.env.DEV': false,
  },
});
