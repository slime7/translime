/**
 * 判定标题栏与工具栏在当前鼠标坐标下是否应该显示。
 *
 * @param {object} options
 * @param {number} options.x - 鼠标在客户区的 CSS X 坐标。
 * @param {number} options.y - 鼠标在客户区的 CSS Y 坐标。
 * @param {number} options.width - 窗口客户区 CSS 宽度。
 * @param {number} options.height - 窗口客户区 CSS 高度。
 * @param {number} [options.topThreshold=56] - 触发顶部标题栏区域的 Y 坐标阈值。
 * @param {number} [options.rightThreshold=88] - 触发右侧工具栏区域的右侧边距阈值。
 * @returns {boolean}
 */
export const isChromeRevealed = ({
  x,
  y,
  width,
  height,
  topThreshold = 56,
  rightThreshold = 88,
}) => {
  if (typeof x !== 'number' || typeof y !== 'number') {
    return false;
  }
  if (x < 0 || y < 0 || x > width || y > height) {
    return false;
  }
  if (y <= topThreshold) {
    return true;
  }
  if (x >= width - rightThreshold) {
    return true;
  }
  return false;
};

export default isChromeRevealed;
