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
        /* axios 在 1.x 版本中的 `package.json` 使用了 exports 字段，使 lib 目录无法正常引入
         * https://github.com/axios/axios/issues/5000
         */
        {
          find: /^axios\/lib\/(.*)/,
          replacement: `${join(MODULES_ROOT, 'axios/lib')}/$1`,
        },
      ],
    },
    build: {
      sourcemap: isDev ? 'inline' : false,
      target: 'node18',
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
          ...Array.form(builtinModules).map((m) => `node:${m}`),
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
