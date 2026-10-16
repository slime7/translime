/**
 * 插件深链注册表。
 *
 * 插件在主进程内通过 SDK `registerDeepLinkHandlers(pluginId, handlers)` 声明
 * `translime://plugin/<插件名>/<路径>` 深链的处理函数：handlers 为
 * `{ [路径]: (event) => void }`，路径按去首尾斜杠、压连续斜杠后的精确匹配，
 * 事件参数为 `{ path, params }`（params 为深链查询参数）。
 *
 * 宿主收到深链后由 deepLink.js 先确保插件激活，再经 dispatch 分发；
 * 插件停用/重启/卸载时由宿主调用 clear 清理登记。
 */

// 防御性上限：异常输入不应在注册表内堆积
const MAX_HANDLERS = 64;

const normalizePath = (path) => String(path ?? '')
  .trim()
  .replace(/^\/+|\/+$/g, '')
  .replace(/\/{2,}/g, '/');

class DeepLinkRegistry {
  /**
   * @type {Map<string, Map<string, Function>>}
   */
  #plugins = new Map();

  /**
   * 设置插件的深链处理函数（整体替换）。传空对象或 null 等价于清除。
   * @param {string} packageName 插件包名
   * @param {Record<string, Function>|null} handlers 路径到处理函数的映射
   * @returns {boolean} 是否生效
   */
  setDeepLinkHandlers(packageName, handlers) {
    const name = String(packageName || '');
    if (!name) {
      return false;
    }
    if (handlers == null || typeof handlers !== 'object' || Array.isArray(handlers)) {
      return this.clearDeepLinkHandlers(name);
    }
    const entries = new Map();
    Object.entries(handlers).forEach(([path, handler]) => {
      if (entries.size >= MAX_HANDLERS) {
        return;
      }
      const normalized = normalizePath(path);
      if (!normalized || typeof handler !== 'function') {
        return;
      }
      entries.set(normalized, handler);
    });
    if (!entries.size) {
      return this.clearDeepLinkHandlers(name);
    }
    this.#plugins.set(name, entries);
    return true;
  }

  /**
   * 清除插件的深链登记（插件停用/卸载/重启时由宿主调用）。
   * @param {string} packageName 插件包名
   * @returns {boolean} 是否有登记被清除
   */
  clearDeepLinkHandlers(packageName) {
    const name = String(packageName || '');
    if (!name || !this.#plugins.has(name)) {
      return false;
    }
    this.#plugins.delete(name);
    return true;
  }

  /**
   * 分发深链到插件注册的处理函数；处理函数异常原样向外抛，由调用方统一捕获记录。
   * @param {string} packageName 插件包名
   * @param {string} path 去掉插件段后的深链路径
   * @param {Record<string, string>} params 深链查询参数
   * @returns {boolean} 是否命中并执行
   */
  dispatch(packageName, path, params) {
    const entries = this.#plugins.get(String(packageName || ''));
    if (!entries) {
      return false;
    }
    const normalized = normalizePath(path);
    const handler = entries.get(normalized);
    if (typeof handler !== 'function') {
      return false;
    }
    handler({ path: normalized, params });
    return true;
  }
}

// 保证单例
if (!global.deepLinkRegistry) {
  global.deepLinkRegistry = new DeepLinkRegistry();
}
const { deepLinkRegistry } = global;

export default deepLinkRegistry;
