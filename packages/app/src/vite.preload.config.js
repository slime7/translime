import { join } from 'node:path';
import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

const PACKAGE_ROOT = join(import.meta.dirname, 'preload');

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
      mainFields: ['module', 'jsnext:main', 'jsnext', 'main'],
    },
    build: {
      sourcemap: isDev ? 'inline' : false,
      target: 'node18',
      outDir: join(PACKAGE_ROOT, '../../dist/preload'),
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
        /**
         * preload 使用 esm 出现 bug
         * https://github.com/electron/electron/issues/46614
         */
        formats: ['cjs'],
        fileName: () => '[name].cjs',
      },
      rollupOptions: {
        external: [
          'electron',
          ...builtinModules,
          ...builtinModules.map((m) => `node:${m}`),
        ],
      },
      emptyOutDir: true,
      brotliSize: false,
    },
  };
});
