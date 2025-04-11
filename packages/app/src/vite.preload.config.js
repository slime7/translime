import { join } from 'node:path';
import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

const PACKAGE_ROOT = join(__dirname, 'preload');
const MODULES_ROOT = join(__dirname, '../node_modules');

/**
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
      target: 'es2021',
      outDir: join(PACKAGE_ROOT, '../../dist/preload'),
      assetsDir: '.',
      minify: isDev ? false : 'terser',
      terserOptions: isDev ? undefined : {
        ecma: 2021,
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
});
