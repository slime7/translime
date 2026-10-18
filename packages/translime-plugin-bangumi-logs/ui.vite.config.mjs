import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import {
  createPluginCssIsolationPlugins,
  translimeSdk,
} from 'translime-sdk/vite';

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
export default defineConfig(({ mode }) => {
  const isPreview = mode === 'preview';

  return {
    plugins: [
      vue(),
      tailwindcss(),
      translimeSdk(),
      ...createPluginCssIsolationPlugins('translime-plugin-bangumi-logs'),
    ],
    envDir: process.cwd(),
    build: {
      minify: false,
      sourcemap: isPreview ? 'inline' : false,
      target: 'node20',
      outDir: './dist',
      lib: {
        entry: 'ui.vue',
        name: 'translime-plugin-bangumi-logs',
        formats: ['esm'],
        fileName: (format) => `ui.${format}.js`,
        cssFileName: 'ui',
      },
      rolldownOptions: {
        external: ['vue'],
      },
      emptyOutDir: false,
    },
  };
});
