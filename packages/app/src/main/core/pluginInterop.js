import EventEmitter from 'node:events';

class PluginInterop extends EventEmitter {
  /**
   * @type {Map<string, any>} 注册表
   */
  #registry = new Map();

  /**
   * 注册插件公共 API
   * @param {string} pluginId 插件 ID
   * @param {any} exports API 对象
   */
  register(pluginId, exports) {
    if (!pluginId || !exports) return;
    this.#registry.set(pluginId, exports);
    this.emit('activated', pluginId, exports);
  }

  /**
   * 注销插件 API
   * @param {string} pluginId 插件 ID
   */
  unregister(pluginId) {
    if (this.#registry.delete(pluginId)) {
      this.emit('deactivated', pluginId);
    }
  }

  /**
   * 获取目标插件的 API 引用
   * @param {string} pluginId 插件 ID
   * @returns {any|undefined} 插件的 libs 对象
   */
  getExports(pluginId) {
    return this.#registry.get(pluginId);
  }

  /**
   * 获取所有已注册公共 API 的插件列表
   * @returns {string[]} 插件 ID 数组
   */
  getRegisteredPlugins() {
    return Array.from(this.#registry.keys());
  }

  /**
   * 等待目标插件被激活并获取其 API
   * @param {string} pluginId 目标插件 ID
   * @param {number} [timeout=10000] 超时时间 (毫秒)，0 表示永不超时
   * @returns {Promise<any>}
   */
  waitForPlugin(pluginId, timeout = 10000) {
    const existing = this.#registry.get(pluginId);
    // 如果已经注册，直接返回
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      let timer = null;

      const onActivated = (id, exports) => {
        if (id === pluginId) {
          if (timer) clearTimeout(timer);
          this.off('activated', onActivated);
          resolve(exports);
        }
      };

      if (timeout > 0) {
        timer = setTimeout(() => {
          this.off('activated', onActivated);
          reject(new Error(`等待插件 "${pluginId}" 激活超时`));
        }, timeout);
      }

      this.on('activated', onActivated);
    });
  }
}

// 保证单例
if (!global.pluginInterop) {
  global.pluginInterop = new PluginInterop();
}
const { pluginInterop } = global;

export default pluginInterop;
