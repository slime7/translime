import vue from '@vitejs/plugin-vue';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config = {
  plugins: [
    vue(),
    cssInjectedByJsPlugin(), // 将样式文件放入 js
  ],
  envDir: process.cwd(),
  build: {
    minify: false,
    sourcemap: 'inline',
    target: 'node16',
    outDir: './dist',
    lib: {
      entry: 'ui.vue',
      name: 'translime-plugin-example', // 需要指定一个唯一 id
      formats: ['esm'], // 现在使用 esm 导入插件 ui
      fileName: (format) => `ui.${format}.js`,
    },
    rollupOptions: {
      external: ['vue'], // 打包排除 vue 依赖并且主项目有 `importmap`，不需要设置全局变量
    },
    emptyOutDir: false,
  },
};

export default config;
