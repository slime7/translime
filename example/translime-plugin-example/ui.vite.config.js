import { builtinModules } from 'module';
import { createVuePlugin } from 'vite-plugin-vue2';

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config = {
  plugins: [
    createVuePlugin(),
  ],
  envDir: process.cwd(),
  build: {
    sourcemap: false,
    target: 'node14',
    outDir: './dist',
    terserOptions: {
      ecma: 2021,
      compress: {
        passes: 2,
      },
      safari10: false,
    },
    lib: {
      entry: 'ui.vue',
      name: `translime-plugin-example${process.env.NODE_ENV === 'production' ? '' : '@dev'}`, // 需要指定一个唯一 id
      fileName: (format) => `ui.${format}.js`,
    },
    cssCodeSplit: true,
    rollupOptions: {
      external: [
        'vue',
        ...builtinModules,
      ],
      output: {
        globals: {
          vue: 'Vue',
        },
      },
    },
    emptyOutDir: false,
  },
};

export default config;
