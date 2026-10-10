import {
  existsSync, mkdirSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const currentDir = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(currentDir, '../../..');
const MODULES_ROOT = resolve(APP_ROOT, 'node_modules');

export const DEFAULT_MDE_ENTRY = resolve(MODULES_ROOT, 'mde-vue/dist/mde-vue.js');
export const DEFAULT_CACHE_DIR = resolve(MODULES_ROOT, '.cache/translime-mde');
export const DEFAULT_STANDALONE_FILE = resolve(DEFAULT_CACHE_DIR, 'mde.esm.js');

/**
 * 构建或获取自包含的 MDE 运行时 ESM 文件路径。
 * 将 mde-vue 对 @material/material-color-utilities 的依赖预打包内联，外部依赖仅保留 vue。
 *
 * @param {object} [options]
 * @param {string} [options.entry] - mde-vue 入口路径
 * @param {string} [options.cacheDir] - 缓存目录路径
 * @param {string} [options.outputFile] - 输出文件路径
 * @param {boolean} [options.force=false] - 是否强制重新构建
 * @returns {Promise<string>} 自包含 mde.esm.js 文件绝对路径
 */
export async function buildStandaloneMdeBundle(options = {}) {
  const entry = options.entry || DEFAULT_MDE_ENTRY;
  const cacheDir = options.cacheDir || DEFAULT_CACHE_DIR;
  const outputFile = options.outputFile || (options.cacheDir ? join(options.cacheDir, 'mde.esm.js') : DEFAULT_STANDALONE_FILE);
  const force = Boolean(options.force);

  if (!force && existsSync(outputFile) && existsSync(entry)) {
    try {
      const outputMtime = statSync(outputFile).mtimeMs;
      const entryMtime = statSync(entry).mtimeMs;
      if (outputMtime >= entryMtime) {
        return outputFile;
      }
    } catch {
      // 状态检查异常时重新构建
    }
  }

  const result = await build({
    configFile: false,
    root: APP_ROOT,
    logLevel: 'error',
    build: {
      write: false,
      lib: {
        entry,
        formats: ['es'],
        fileName: () => 'mde.esm.js',
      },
      rollupOptions: {
        external: ['vue'],
      },
      minify: false,
    },
  });

  const output = Array.isArray(result) ? result[0].output : result.output;
  const code = output[0]?.code;
  if (!code) {
    throw new Error('构建自包含 MDE 运行时失败: 输出代码为空');
  }

  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(outputFile, code, 'utf8');

  return outputFile;
}

export default buildStandaloneMdeBundle;
