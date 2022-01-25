import { join } from 'path';
import { builtinModules } from 'module';

const PACKAGE_ROOT = join(__dirname, 'preload');

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config = {
  mode: process.env.MODE,
  root: PACKAGE_ROOT,
  envDir: process.cwd(),
  resolve: {
    alias: [
      {
        find: '@pkg/',
        replacement: `${join(PACKAGE_ROOT, '..')}/`,
      },
      {
        find: '@/',
        replacement: `${join(PACKAGE_ROOT, '../renderer')}/`,
      },
    ],
  },
  build: {
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
    target: 'es2021',
    outDir: join(PACKAGE_ROOT, '../../dist/preload'),
    assetsDir: '.',
    minify: process.env.MODE === 'development' ? false : 'terser',
    terserOptions: {
      ecma: 2020,
      compress: {
        passes: 2,
      },
      safari10: false,
    },
    lib: {
      entry: 'index.js',
      formats: ['cjs'],
    },
    rollupOptions: {
      external: [
        'electron',
        ...builtinModules,
      ],
      output: {
        entryFileNames: '[name].js',
      },
    },
    emptyOutDir: true,
    brotliSize: false,
  },
};

export default config;
