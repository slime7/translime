import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import tailwindcss from '@tailwindcss/vite';

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
      entry: 'src/ui/ui.vue',
      name: 'translime-plugin-steam-save-backup',
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
