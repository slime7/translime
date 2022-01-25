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
    sourcemap: true,
    target: 'node14',
    outDir: './dist',
    assetsDir: '.',
    terserOptions: {
      ecma: 2021,
      compress: {
        passes: 2,
      },
      safari10: false,
    },
    lib: {
      entry: 'index.js',
      name: 'plugin',
      fileName: (format) => `index.${format}.js`,
    },
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
    emptyOutDir: true,
  },
};

export default config;
