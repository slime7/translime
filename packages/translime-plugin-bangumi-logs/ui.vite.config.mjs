/* eslint-disable import/no-unresolved */
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import vuetify from 'vite-plugin-vuetify';
import { getPreviewSettingsPath, translimeSdk } from 'translime-sdk/vite';

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
      cssInjectedByJsPlugin({
        styleId: 'translime-plugin-bangumi-logs',
        injectCodeFunction: function injectCodeCustomRunTimeFunction(cssCode, options) {
          try {
            if (typeof document !== 'undefined') {
              const elementStyle = document.createElement('style');
              elementStyle.id = options.styleId;

              const existingElement = document.getElementById(options.styleId);
              if (existingElement) {
                existingElement.remove();
              }
              elementStyle.appendChild(document.createTextNode(`${cssCode}`));
              document.head.appendChild(elementStyle);
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('vite-plugin-css-injected-by-js', e);
          }
        },
      }),
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
