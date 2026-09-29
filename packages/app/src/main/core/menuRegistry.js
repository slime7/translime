/**
 * 渲染端菜单登记表。
 *
 * 宿主菜单已从 Electron 原生 `Menu.popup()` 迁移为渲染端 mde `<mat-menu>`：
 * 主进程只生成可序列化的菜单描述，并把各菜单项的处理函数登记在此；
 * 渲染端点击菜单项后回传 `menuId` 与菜单项 id，由 `dispatchMenuAction` 执行。
 */
const pendingMenus = new Map();

// 菜单未点击任何项目直接关闭时不会有回传，按 FIFO 淘汰最旧的登记避免累积
const MAX_PENDING_MENUS = 20;

let menuSeq = 0;

/**
 * 登记一份菜单的点击处理函数。
 *
 * @param {Map<string, Function>} actions - 菜单项 id 到处理函数的映射。
 * @returns {string} 菜单标识，渲染端回传动作时需原样携带。
 */
export const registerMenu = (actions) => {
  menuSeq += 1;
  const menuId = `host-menu-${menuSeq}`;
  pendingMenus.set(menuId, actions);
  while (pendingMenus.size > MAX_PENDING_MENUS) {
    const oldestMenuId = pendingMenus.keys().next().value;
    pendingMenus.delete(oldestMenuId);
  }
  return menuId;
};

/**
 * 执行渲染端回传的菜单动作，并消费对应登记。
 *
 * @param {string} menuId - 菜单标识。
 * @param {string} itemId - 菜单项 id。
 * @returns {boolean} 是否命中并执行了处理函数。
 */
export const dispatchMenuAction = (menuId, itemId) => {
  const actions = typeof menuId === 'string' ? pendingMenus.get(menuId) : null;
  if (!actions) {
    return false;
  }
  pendingMenus.delete(menuId);
  const handler = actions.get(itemId);
  if (!handler) {
    return false;
  }
  handler();
  return true;
};
