import { resolve } from 'node:path';
import preact from '@preact/preset-vite';

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config = {
  plugins: [preact()],
  envDir: process.cwd(),
  base: './',
  build: {
    minify: false,
    sourcemap: 'inline',
    target: 'node16',
    outDir: './dist',
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        ui: resolve(__dirname, 'ui.html'),
      },
    },
    emptyOutDir: false,
  },
};

export default config;
