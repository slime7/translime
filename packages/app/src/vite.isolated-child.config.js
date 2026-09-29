import { join } from 'node:path';
import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

const PACKAGE_ROOT = join(import.meta.dirname, 'main/isolated-child');

/**
 * 隔离插件子进程引导脚本的构建配置。
 *
 * 产物为 dist/main/isolated-child.cjs，与主进程产物同目录，
 * 由 `isolatedRuntime.js` 按相对路径 fork。
 *
 * @see https://vitejs.dev/config/
 */
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  return {
    mode,
    root: PACKAGE_ROOT,
    envDir: process.cwd(),
    build: {
      sourcemap: isDev ? 'inline' : false,
      target: 'node20',
      // 独立目录：主进程构建会 emptyOutDir dist/main，并行构建时互不影响
      outDir: join(PACKAGE_ROOT, '../../../dist/isolated-child'),
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
        entry: join(PACKAGE_ROOT, 'index.js'),
        formats: ['cjs'],
        fileName: () => '[name].cjs',
      },
      rolldownOptions: {
        external: [
          ...builtinModules,
          ...builtinModules.map((m) => `node:${m}`),
        ],
        output: {
          entryFileNames: '[name].cjs',
        },
      },
      emptyOutDir: false,
      brotliSize: false,
    },
  };
});
