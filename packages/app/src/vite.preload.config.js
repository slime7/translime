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
      target: 'node20',
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
        // preload 产物必须保持 CJS：主窗口、启动窗与通用窗口均为 sandbox: true，
        // Electron 仅在非沙箱渲染进程支持 ESM preload（.mjs），沙箱环境只加载 CJS。
        // preload 源码本身是 ESM 写法，由构建器编译为 CJS 产物。
        formats: ['cjs'],
        fileName: () => '[name].cjs',
      },
      rolldownOptions: {
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
