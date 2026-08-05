/**
 * 按创建顺序对标注列表进行排序。
 *
 * @param {Array<{ id?: number }>} [annotations=[]] - 原始标注列表。
 * @returns {Array<object>} 返回按 `id` 升序排列后的新数组。
 */
export function sortAnnotationsByHistory(annotations = []) {
  return [...annotations].sort((left, right) => (left.id || 0) - (right.id || 0));
}

/**
 * 解析当前活动标注应使用的工具类型。
 *
 * @param {object} [options={}] - 解析参数。
 * @param {string|null} [options.overrideTool=null] - 外部强制指定的工具类型。
 * @param {{ tool?: string }|null} [options.activeAnnotation=null] - 当前活动标注。
 * @param {string|null} [options.activeTool=null] - 当前全局活动工具。
 * @param {string} [options.fallbackTool='rect'] - 兜底工具类型。
 * @returns {string} 返回解析后的工具类型。
 */
export function resolveAnnotationTool({
  overrideTool = null,
  activeAnnotation = null,
  activeTool = null,
  fallbackTool = 'rect',
} = {}) {
  return overrideTool || activeAnnotation?.tool || activeTool || fallbackTool;
}

/**
 * 生成用于导出流程的标注步骤元数据。
 *
 * @param {Array<object>} [annotations=[]] - 已定型标注列表。
 * @param {number} [originX=0] - 选区左上角 X 坐标。
 * @param {number} [originY=0] - 选区左上角 Y 坐标。
 * @returns {Array<object>} 返回按历史顺序排列的导出步骤元数据。
 */
export function buildAnnotationStepsMeta(annotations = [], originX = 0, originY = 0) {
  return sortAnnotationsByHistory(annotations).map((annotation) => {
    if (annotation.tool === 'mosaic') {
      return {
        type: 'mosaic',
        region: {
          x: annotation.x - originX,
          y: annotation.y - originY,
          w: annotation.w,
          h: annotation.h,
          mode: annotation.mode || 'pixelate',
          blockSize: annotation.blockSize || 10,
        },
      };
    }

    return {
      type: 'overlay',
      annotation,
    };
  });
}
