import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import vuetify from 'vite-plugin-vuetify';
import {
  createPluginCssIsolationPlugins,
  getPreviewSettingsPath,
  translimeSdk,
} from 'translime-sdk/vite';

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
export default defineConfig(({ mode }) => {
  const isPreview = mode === 'preview';

  const plugins = [
    vue(),
    tailwindcss(),
    translimeSdk(),
  ];

  if (isPreview) {
    plugins.push(
      vuetify({
        styles: {
          configFile: getPreviewSettingsPath(),
        },
      }),
    );
  } else {
    plugins.push(
      ...createPluginCssIsolationPlugins('translime-plugin-bangumi-logs'),
    );
  }

  return {
    plugins,
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
