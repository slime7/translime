/**
 * excludeList 设置的读写与格式转换。
 * 排除列表以逗号分隔的 AppID 字符串存储，同时兼容数组读取。
 */

// 解析数组或逗号分隔字符串为 AppID 列表
export const parseExcludeList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

/**
 * @param {Object|null} config 宿主配置存储（mainStore.config）
 * @param {string} pluginId 插件包名
 * @returns {{ get: () => string[], save: (list: string[]) => void, migrate: () => boolean }}
 */
const createExcludeListStore = (config, pluginId) => {
  const key = `plugin.${pluginId}.settings.excludeList`;

  return {
    get: () => {
      if (!config) {
        return [];
      }
      return parseExcludeList(config.get(key, []));
    },
    save: (list) => {
      if (!config) {
        return;
      }
      config.set(key, list.join(','));
    },
    // 将数组格式迁移为逗号分隔字符串
    migrate: () => {
      if (!config) {
        return false;
      }
      const raw = config.get(key);
      if (!Array.isArray(raw)) {
        return false;
      }
      config.set(key, raw.join(','));
      return true;
    },
  };
};

export default createExcludeListStore;
