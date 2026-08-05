import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { createPluginCssIsolationPlugins } from 'translime-sdk/vite';

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    tailwindcss(),
    ...createPluginCssIsolationPlugins('translime-plugin-static-server'),
  ],
  envDir: process.cwd(),
  build: {
    minify: false,
    sourcemap: mode === 'preview' ? 'inline' : false,
    target: 'node20',
    outDir: './dist',
    lib: {
      entry: 'src/ui.vue',
      name: 'translime-plugin-static-server', // 需要指定一个唯一 id
      formats: ['esm'],
      fileName: (format) => `ui.${format}.js`,
    },
    rolldownOptions: {
      external: [
        'vue',
      ],
    },
    emptyOutDir: false,
  },
}));
