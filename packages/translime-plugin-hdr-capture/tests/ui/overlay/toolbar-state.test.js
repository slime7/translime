import {
  describe, expect, it,
} from 'vitest';
import {
  DRAWING_PANELS,
  getDrawingStateForPanelChange,
  getReservedToolbarHeight,
  toggleToolbarPanel,
  TOOLBAR_LAYOUT,
} from '../../../src/ui/overlay/toolbar-state';

describe('toolbar-state', () => {
  it('应识别绘图类面板', () => {
    expect(DRAWING_PANELS).toEqual(['rect', 'mosaic', 'text']);
  });

  it('再次点击同一面板时应关闭该面板', () => {
    expect(toggleToolbarPanel('mosaic', 'mosaic')).toBeNull();
  });

  it('切换到绘图类面板时应进入对应工具', () => {
    expect(getDrawingStateForPanelChange('mosaic', null)).toEqual({
      drawingMode: true,
      activeTool: 'mosaic',
    });
  });

  it('关闭绘图类面板时应退出绘图工具', () => {
    expect(getDrawingStateForPanelChange(null, 'rect')).toEqual({
      drawingMode: false,
      activeTool: null,
    });
  });

  it('非绘图面板之间切换时不应改动绘图状态', () => {
    expect(getDrawingStateForPanelChange('size', 'radius')).toBeNull();
  });

  it('动作栏定位占位高度应固定预留次级面板空间', () => {
    expect(getReservedToolbarHeight()).toBe(
      TOOLBAR_LAYOUT.mainHeight + TOOLBAR_LAYOUT.spacing + TOOLBAR_LAYOUT.panelHeight,
    );
  });
});
