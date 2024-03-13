import vue from '@vitejs/plugin-vue';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import pkg from './package.json';

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
    sourcemap: 'inline',
    target: 'node16',
    outDir: './dist',
    lib: {
      entry: 'src/ui.vue',
      name: pkg.name, // 需要指定一个唯一 id
      formats: ['esm'],
      fileName: (format) => `ui.${format}.js`,
    },
    cssCodeSplit: true,
    rollupOptions: {
      external: [
        'vue',
      ],
    },
    emptyOutDir: false,
  },
};

export default config;
