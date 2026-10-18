import {
  describe, expect, it, vi,
} from 'vitest';

const { createMatUiMock } = vi.hoisted(() => ({
  createMatUiMock: vi.fn(() => ({ theme: { setMode: vi.fn() } })),
}));

vi.mock('mde-vue', () => ({
  createMatUi: createMatUiMock,
}));

describe('宿主 mde-vue 默认主题', () => {
  it('使用 translime 种子色与 Expressive 变体初始化主题', async () => {
    await import('@/plugins/matUi');

    expect(createMatUiMock).toHaveBeenCalledWith(expect.objectContaining({
      theme: {
        mode: 'light',
        seedColor: '#20a6fc',
        schemeVariant: 'expressive',
      },
    }));
  });
});
