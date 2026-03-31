/**
 * 绘图类工具面板列表。
 * 这些面板在展开时会进入绘图模式，关闭时退出绘图模式。
 *
 * @type {Array<'rect'|'mosaic'|'text'>}
 */
export const DRAWING_PANELS = ['rect', 'mosaic', 'text'];

/**
 * 切换工具栏当前展开的二级面板。
 *
 * @param {string|null} currentPanel - 当前展开的面板标识。
 * @param {string} nextPanel - 用户本次点击的面板标识。
 * @returns {string|null} 返回切换后的面板标识；再次点击同一面板时返回 `null`。
 */
export function toggleToolbarPanel(currentPanel, nextPanel) {
  if (currentPanel === nextPanel) {
    return null;
  }

  return nextPanel;
}

/**
 * 根据面板切换结果推导绘图模式状态。
 *
 * @param {string|null} newPanel - 切换后的面板标识。
 * @param {string|null} oldPanel - 切换前的面板标识。
 * @returns {{ drawingMode: boolean, activeTool: string|null }|null}
 * 返回需要同步到状态树的绘图状态；若本次切换与绘图模式无关则返回 `null`。
 */
export function getDrawingStateForPanelChange(newPanel, oldPanel) {
  if (DRAWING_PANELS.includes(newPanel)) {
    return {
      drawingMode: true,
      activeTool: newPanel,
    };
  }

  if (DRAWING_PANELS.includes(oldPanel)) {
    return {
      drawingMode: false,
      activeTool: null,
    };
  }

  return null;
}
