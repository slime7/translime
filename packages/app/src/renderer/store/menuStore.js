import { acceptHMRUpdate, defineStore } from 'pinia';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useAlert from '@/hooks/useAlert';

const ipc = useIpc();

/**
 * 宿主上下文菜单状态。
 *
 * 宿主菜单统一由主进程生成可序列化描述，本 store 负责请求描述、
 * 驱动全局 `HostMenu`（mat-menu）展示，并把点击动作回传主进程执行。
 */
const useMenuStore = defineStore('menuStore', {
  state: () => ({
    open: false,
    /** 元素 id 或 `[clientX, clientY]` 坐标，交给 mat-menu 的 anchor */
    anchor: [0, 0],
    menuId: '',
    items: [],
    /** 文本编辑菜单：点击动作前需把焦点还给原输入框 */
    focusEl: null,
  }),
  actions: {
    /**
     * 从触发事件推导菜单锚点：优先触发元素 id（菜单显示在其下方），否则使用指针坐标。
     *
     * @param {MouseEvent} [event]
     * @returns {string|number[]}
     */
    anchorFromEvent(event) {
      const target = event?.currentTarget;
      if (target?.id) {
        return target.id;
      }
      return [event?.clientX ?? 0, event?.clientY ?? 0];
    },
    /**
     * 请求菜单描述并打开菜单；请求失败或无可显示项目时保持关闭。
     *
     * @param {Function} request - 返回 `{menuId, items}` 描述的请求函数。
     * @param {{anchor?: string|number[], focusEl?: HTMLElement|null}} [options]
     * @returns {Promise<void>}
     */
    async request(request, { anchor = [0, 0], focusEl = null } = {}) {
      try {
        const menu = await request();
        if (!menu?.items?.length) {
          return;
        }
        this.$patch({
          open: true,
          anchor,
          menuId: menu.menuId,
          items: menu.items,
          focusEl,
        });
      } catch (err) {
        useAlert().show(err.message, 'error');
      }
    },
    /**
     * 打开插件上下文菜单。
     *
     * @param {string} packageName - 插件包名。
     * @param {MouseEvent} [event] - 触发事件，用于推导锚点。
     * @returns {Promise<void>}
     */
    openPluginMenu(packageName, event) {
      return this.request(
        () => ipc.invoke(ipcType.OPEN_PLUGIN_CONTEXT_MENU, packageName),
        { anchor: this.anchorFromEvent(event) },
      );
    },
    /**
     * 在指针位置打开文本编辑上下文菜单。
     *
     * @param {MouseEvent} [event] - `contextmenu` 事件。
     * @returns {Promise<void>}
     */
    openTextEditMenu(event) {
      const selectedText = window.getSelection()?.toString() ?? '';
      return this.request(
        () => ipc.invoke(ipcType.SHOW_TEXT_EDIT_CONTEXT, { selectedText }),
        {
          anchor: [event?.clientX ?? 0, event?.clientY ?? 0],
          focusEl: event?.currentTarget ?? null,
        },
      );
    },
    close() {
      this.open = false;
    },
    /**
     * 回传菜单动作并关闭菜单。
     *
     * @param {{id: string}} item - 被点击的菜单项。
     * @returns {void}
     */
    select(item) {
      // 先把焦点还给原输入框，剪切/复制等编辑动作才能作用于目标文本
      this.focusEl?.focus?.();
      const { menuId } = this;
      this.close();
      ipc.send(ipcType.PLUGIN_CONTEXT_MENU_ACTION, { menuId, itemId: item.id });
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMenuStore, import.meta.hot));
}

export default useMenuStore;
