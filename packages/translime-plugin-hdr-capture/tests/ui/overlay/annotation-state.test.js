import {
  describe, expect, it,
} from 'vitest';
import {
  buildAnnotationStepsMeta,
  resolveAnnotationTool,
  sortAnnotationsByHistory,
} from '../../../src/ui/overlay/annotation-state';

describe('annotation-state', () => {
  it('应优先使用活动标注自身记录的工具类型', () => {
    expect(resolveAnnotationTool({
      activeAnnotation: { tool: 'mosaic' },
      activeTool: null,
    })).toBe('mosaic');
  });

  it('应允许 overrideTool 覆盖当前工具类型', () => {
    expect(resolveAnnotationTool({
      overrideTool: 'rect',
      activeAnnotation: { tool: 'mosaic' },
      activeTool: 'mosaic',
    })).toBe('rect');
  });

  it('应按历史顺序排序标注', () => {
    const ordered = sortAnnotationsByHistory([
      { id: 9, tool: 'text' },
      { id: 2, tool: 'mosaic' },
      { id: 5, tool: 'rect' },
    ]);

    expect(ordered.map((item) => item.id)).toEqual([2, 5, 9]);
  });

  it('应按历史顺序生成导出步骤，并保留马赛克区域信息', () => {
    const steps = buildAnnotationStepsMeta([
      {
        id: 3,
        tool: 'text',
        x: 50,
        y: 60,
        text: 'hello',
      },
      {
        id: 1,
        tool: 'mosaic',
        x: 20,
        y: 30,
        w: 40,
        h: 50,
        mode: 'blur',
        blockSize: 12,
      },
      {
        id: 2,
        tool: 'rect',
        x: 25,
        y: 35,
        w: 10,
        h: 12,
        type: 'stroke',
      },
    ], 10, 20);

    expect(steps).toHaveLength(3);
    expect(steps.map((step) => step.type)).toEqual(['mosaic', 'overlay', 'overlay']);
    expect(steps[0].region).toEqual({
      x: 10,
      y: 10,
      w: 40,
      h: 50,
      mode: 'blur',
      blockSize: 12,
    });
    expect(steps[1].annotation.tool).toBe('rect');
    expect(steps[2].annotation.tool).toBe('text');
  });
});
