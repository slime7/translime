import { join } from 'node:path';
import { builtinModules } from 'node:module';
import { external } from '../package.json';

const PACKAGE_ROOT = join(__dirname, 'main');

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
        find: /^@pkg\/(.*)/,
        replacement: `${join(PACKAGE_ROOT, '..')}/$1`,
      },
      {
        find: /^@\/(.*)/,
        replacement: `${join(PACKAGE_ROOT, '../renderer')}/$1`,
      },
    ],
  },
  build: {
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
    target: 'node14',
    outDir: join(PACKAGE_ROOT, '../../dist/main'),
    assetsDir: '.',
    minify: process.env.MODE === 'development' ? false : 'terser',
    terserOptions: process.env.MODE === 'development' ? undefined : {
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
        'electron-devtools-installer',
        ...builtinModules,
        ...external,
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
