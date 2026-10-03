import { EventEmitter } from 'node:events';

/**
 * 插件顶栏按钮区注册表。
 *
 * 插件在主进程内通过 SDK `setTitleBarActions(pluginId, actions)` 动态声明
 * 宿主插件页顶栏（inspect 旁）的按钮，结构类似 Electron Menu 模板：
 *
 * - `{ label, icon?, iconOnly?, tooltip?, enabled?, visible?, click }` 直按钮
 * - `{ label, icon?, tooltip?, enabled?, visible?, submenu: [...] }` 下拉菜单
 * - 子菜单内支持 `{ type: 'separator' }`，可继续嵌套 submenu
 *
 * 注册表只保留可序列化描述与点击函数：描述推送给渲染端渲染，
 * 点击经 `run-title-bar-action` 通道回传后按 id 路径执行对应函数。
 */

// 防御性上限：异常输入不应撑爆宿主顶栏或点击函数表
const MAX_TOP_LEVEL_ITEMS = 8;
const MAX_ACTIONS = 64;

// 清理首/尾/连续分隔线，避免渲染端出现成排空divider
const compactSeparators = (items) => items.filter((item, index) => {
  if (item.type !== 'separator') {
    return true;
  }
  const prev = items[index - 1];
  const next = items[index + 1];
  return Boolean(prev && next) && prev.type !== 'separator' && next.type !== 'separator';
});

/**
 * 递归序列化插件声明：过滤 visible:false 与非法项，为每个可点击叶子分配
 * 稳定的 id 路径并登记点击函数。已登记数量以 actionMap.size 为准。
 *
 * @param {Array<object>} items - 插件声明的菜单模板。
 * @param {string} pathPrefix - 父级 id 路径前缀。
 * @param {Map<string, Function>} actionMap - id 到点击函数的登记表。
 * @returns {Array<object>} 可序列化描述。
 */
const serializeItems = (items, pathPrefix, actionMap) => {
  const serialized = [];
  items.forEach((item, index) => {
    if (actionMap.size >= MAX_ACTIONS) {
      return;
    }
    if (!item || typeof item !== 'object' || item.visible === false) {
      return;
    }
    if (item.type === 'separator') {
      serialized.push({ type: 'separator' });
      return;
    }
    const id = pathPrefix ? `${pathPrefix}-${index}` : `${index}`;
    if (Array.isArray(item.submenu)) {
      const children = serializeItems(item.submenu, id, actionMap);
      // 只有分隔线的空子菜单没有渲染价值
      if (!children.some((child) => child.type !== 'separator')) {
        return;
      }
      serialized.push({
        id,
        type: 'submenu',
        label: String(item.label || ''),
        ...(item.icon ? { icon: String(item.icon) } : {}),
        ...(item.tooltip ? { tooltip: String(item.tooltip) } : {}),
        ...(item.enabled === false ? { enabled: false } : {}),
        children,
      });
      return;
    }
    if (typeof item.click !== 'function') {
      return;
    }
    actionMap.set(id, item.click);
    serialized.push({
      id,
      label: String(item.label || ''),
      ...(item.icon ? { icon: String(item.icon) } : {}),
      // 紧凑图标按钮：label 转为 tooltip 与无障碍名称
      ...(item.icon && item.label && item.iconOnly ? { iconOnly: true } : {}),
      ...(item.tooltip ? { tooltip: String(item.tooltip) } : {}),
      ...(item.enabled === false ? { enabled: false } : {}),
    });
  });
  return compactSeparators(serialized);
};

class TitleBarRegistry extends EventEmitter {
  /**
   * @type {Map<string, {items: Array<object>, actions: Map<string, Function>}>}
   */
  #plugins = new Map();

  /**
   * 设置插件的顶栏按钮（整体替换）。传空数组或 null 等价于清除。
   * @param {string} packageName 插件包名
   * @param {Array<object>|null} actions 菜单模板
   * @returns {boolean} 是否生效
   */
  setTitleBarActions(packageName, actions) {
    const name = String(packageName || '');
    if (!name) {
      return false;
    }
    if (!Array.isArray(actions) || actions.length === 0) {
      return this.clearTitleBarActions(name);
    }
    const actionMap = new Map();
    const items = serializeItems(actions.slice(0, MAX_TOP_LEVEL_ITEMS), '', actionMap);
    this.#plugins.set(name, { items, actions: actionMap });
    this.emit('change', this.getSerializableActions());
    return true;
  }

  /**
   * 清除插件的顶栏按钮（插件停用/卸载/重启时由宿主调用）。
   * @param {string} packageName 插件包名
   * @returns {boolean} 是否有登记被清除
   */
  clearTitleBarActions(packageName) {
    const name = String(packageName || '');
    if (!name || !this.#plugins.has(name)) {
      return false;
    }
    this.#plugins.delete(name);
    this.emit('change', this.getSerializableActions());
    return true;
  }

  /**
   * 执行渲染端回传的按钮动作。
   * @param {string} packageName 插件包名
   * @param {string} id 按钮或菜单项的 id 路径
   * @returns {boolean} 是否命中并执行
   */
  runTitleBarAction(packageName, id) {
    const entry = this.#plugins.get(String(packageName || ''));
    const handler = entry?.actions.get(String(id || ''));
    if (typeof handler !== 'function') {
      return false;
    }
    handler();
    return true;
  }

  /**
   * 全量可序列化描述：`{ [packageName]: items }`，供 GET_PLUGINS 附加与变更推送。
   * @returns {Record<string, Array<object>>}
   */
  getSerializableActions() {
    return Object.fromEntries(
      [...this.#plugins.entries()]
        .filter(([, entry]) => entry.items.length > 0)
        .map(([name, entry]) => [name, entry.items]),
    );
  }
}

// 保证单例
if (!global.titleBarRegistry) {
  global.titleBarRegistry = new TitleBarRegistry();
}
const { titleBarRegistry } = global;

export default titleBarRegistry;
