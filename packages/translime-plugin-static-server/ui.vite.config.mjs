import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    tailwindcss(),
    cssInjectedByJsPlugin({
      styleId: 'translime-plugin-static-server',
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
          console.error('vite-plugin-css-injected-by-js', e);
        }
      },
    }),
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
