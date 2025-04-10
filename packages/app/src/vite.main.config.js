import { join } from 'node:path';
import { builtinModules } from 'node:module';
import { external } from '../package.json';
import { defineConfig } from 'vite';

const PACKAGE_ROOT = join(__dirname, 'main');

/**=
 * @see https://vitejs.dev/config/
 */
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  return {
    mode,
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
      sourcemap: isDev ? 'inline' : false,
      target: 'node14',
      outDir: join(PACKAGE_ROOT, '../../dist/main'),
      assetsDir: '.',
      minify: isDev ? false : 'terser',
      terserOptions: isDev ? undefined : {
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
});
