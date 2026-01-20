import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import pkg from './package.json' with { type: 'json' };

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    tailwindcss(),
    cssInjectedByJsPlugin(),
  ],
  envDir: process.cwd(),
  build: {
    minify: false,
    sourcemap: mode === 'preview' ? 'inline' : false,
    target: 'node20',
    outDir: './dist',
    lib: {
      entry: 'src/ui.vue',
      name: pkg.name, // 需要指定一个唯一 id
      formats: ['esm'],
      fileName: (format) => `ui.${format}.js`,
    },
    rollupOptions: {
      external: [
        'vue',
      ],
    },
    emptyOutDir: false,
  },
}));
