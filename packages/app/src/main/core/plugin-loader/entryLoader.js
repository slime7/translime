import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/**
 * 插件主进程入口加载器。
 *
 * 统一收敛 CJS 与 ESM 两种入口格式的加载差异：
 * - CJS 入口沿用 `createRequire` 同步 require，配合按插件清理 require 缓存
 *   实现热重载；
 * - ESM 入口经动态 `import()` 加载。ESM 模块被 ESM loader 独立缓存，
 *   删除 require.cache 不会触发重新求值，因此改用「入口 URL 追加递增
 *   query」的方式击穿缓存，保证 dev 热重载每次都拿到最新产物。
 *   该方式只作用于入口文件，要求插件入口保持单文件 bundle（模板默认产物）。
 *
 * 两种格式都遵循仓库约定：插件 API 以命名导出提供，并在 default export 中
 * 汇总（CJS 产物由构建器把 default 落到 module.exports，ESM 产物保留在
 * `default` 属性），这里统一做提取，宿主其余代码只面对普通导出对象。
 */

const requireFresh = createRequire(path.join(process.cwd(), 'package.json'));

/**
 * 插件包名 → 下一次 ESM 加载使用的序号。
 *
 * @type {Map<string, number>}
 */
const esmLoadSeq = new Map();

/**
 * 原生动态 import。
 *
 * 经 Function 构造绕过构建器与测试运行器（vite-node / rolldown）的模块
 * 解析改写：带 query 的 file:// URL 只有 Node 原生 ESM loader 能处理，
 * 这正是 ESM 热重载的缓存击穿机制，不能被任何一层转译拦截。
 */
// eslint-disable-next-line no-new-func -- 唯一能稳定发出原生动态 import 的方式
const nativeImport = new Function('specifier', 'return import(specifier);');

/**
 * 提取入口模块的有效导出对象。
 *
 * default export 为对象（非数组）时优先取 default（模板等默认汇总写法），
 * 否则返回原始导出（纯命名导出或 CJS module.exports）。
 *
 * @param {object} imported - require / import 得到的模块对象。
 * @returns {object} 有效导出对象。
 */
const extractEntryExports = (imported) => {
  if (
    imported
    && typeof imported === 'object'
    && !Array.isArray(imported)
    && imported.default !== null
    && typeof imported.default === 'object'
    && !Array.isArray(imported.default)
  ) {
    return imported.default;
  }
  return imported;
};

/**
 * 加载插件主进程入口。
 *
 * @param {object} plugin - 插件对象（需要 pluginPath / exports / entryFormat）。
 * @returns {Promise<object>} 入口的有效导出对象。
 */
const loadPluginEntry = async (plugin) => {
  const entryAbs = path.join(plugin.pluginPath, plugin.exports);

  if (plugin.entryFormat === 'esm') {
    const seq = (esmLoadSeq.get(plugin.packageName) || 0) + 1;
    esmLoadSeq.set(plugin.packageName, seq);
    const entryUrl = `${pathToFileURL(entryAbs).href}?t=${seq}`;
    return extractEntryExports(await nativeImport(entryUrl));
  }

  return extractEntryExports(requireFresh(entryAbs));
};

/**
 * 清理插件在 require 缓存中的全部模块。
 *
 * CJS 入口热重载依赖此步骤拿到新产物；ESM 入口的缓存由 ESM loader
 * 持有、无法按需驱逐（query 击穿绕开），但其 CJS 依赖（如原生模块
 * 的 JS 包装层）仍落在 require 缓存里，同样按插件路径清理。
 *
 * @param {object} plugin - 插件对象。
 * @returns {number} 清理的缓存条目数。
 */
const clearEntryCache = (plugin) => {
  const packagePattern = `${path.sep}${plugin.packageName}${path.sep}`.toLowerCase();
  const normalizedPluginPath = plugin.pluginPath ? plugin.pluginPath.toLowerCase() : '';

  let deletedCount = 0;
  Object.keys(requireFresh.cache).forEach((key) => {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes(packagePattern)
      || (normalizedPluginPath && lowerKey.startsWith(normalizedPluginPath))
    ) {
      delete requireFresh.cache[key];
      deletedCount += 1;
    }
  });
  return deletedCount;
};

export {
  clearEntryCache,
  extractEntryExports,
  loadPluginEntry,
};
