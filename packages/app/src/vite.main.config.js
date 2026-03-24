import { join } from 'node:path';
import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';
import pkg from '../package.json' with { type: 'json' };

const { external = [] } = pkg;

const PACKAGE_ROOT = join(import.meta.dirname, 'main');

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
      target: 'node20',
      outDir: join(PACKAGE_ROOT, '../../dist/main'),
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
        fileName: () => '[name].cjs',
      },
      rolldownOptions: {
        external: [
          'electron',
          'electron-devtools-installer',
          ...builtinModules,
          ...builtinModules.map((m) => `node:${m}`),
          ...external,
        ],
        output: {
          entryFileNames: '[name].cjs',
        },
      },
      emptyOutDir: true,
      brotliSize: false,
    },
  };
});
