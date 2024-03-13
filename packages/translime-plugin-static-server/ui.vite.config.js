import vue from '@vitejs/plugin-vue';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config = {
  plugins: [
    vue(),
    cssInjectedByJsPlugin(),
  ],
  envDir: process.cwd(),
  build: {
    minify: false,
    sourcemap: 'inline',
    target: 'node14',
    outDir: './dist',
    lib: {
      entry: 'src/ui.vue',
      name: 'translime-plugin-static-server', // 需要指定一个唯一 id
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
};

export default config;
