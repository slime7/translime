import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';

const dirname = fileURLToPath(new URL('.', import.meta.url));

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
    rolldownOptions: {
      input: {
        ui: resolve(dirname, 'ui.html'),
      },
    },
    emptyOutDir: false,
  },
};

export default config;
