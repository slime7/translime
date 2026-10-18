import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

import writePngToClipboard from '../../src/main/clipboard';

/**
 * 以函数构造器模拟 Electron 的 ClipboardItem，避免与类计数规则冲突。
 *
 * @param {Record<string, unknown>} items - MIME 类型到数据的映射。
 */
function MockClipboardItem(items) {
  this.types = Object.keys(items);
  this.items = items;
}

const { mockElectron } = vi.hoisted(() => ({
  mockElectron: {
    clipboard: {
      writeImage: vi.fn(),
      write: vi.fn(async () => {}),
    },
    nativeImage: {
      createFromBuffer: vi.fn((buffer) => ({ source: buffer })),
    },
  },
}));

vi.mock('electron', () => mockElectron);

const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe('writePngToClipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElectron.clipboard.writeImage = vi.fn();
    mockElectron.ClipboardItem = MockClipboardItem;
  });

  it('Electron 44 起应经 ClipboardItem 以 image/png 写入原始 PNG 字节', async () => {
    // v44 移除了 clipboard.writeImage，仍按旧接口写入会抛出 is not a function 导致复制静默失败
    delete mockElectron.clipboard.writeImage;

    await writePngToClipboard(pngBuffer);

    expect(mockElectron.clipboard.writeImage).toBeUndefined();
    expect(mockElectron.clipboard.write).toHaveBeenCalledTimes(1);
    const [items] = mockElectron.clipboard.write.mock.calls[0];
    expect(items).toHaveLength(1);
    expect(items[0].types).toEqual(['image/png']);

    const blob = items[0].items['image/png'];
    expect(blob.type).toBe('image/png');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array(pngBuffer));
  });

  it('Electron 39 宿主机应回退到 writeImage', async () => {
    // 宿主 0.8.3 仍在 Electron 39 上，该运行时没有 ClipboardItem
    mockElectron.ClipboardItem = undefined;

    await writePngToClipboard(pngBuffer);

    expect(mockElectron.nativeImage.createFromBuffer).toHaveBeenCalledWith(pngBuffer);
    expect(mockElectron.clipboard.writeImage).toHaveBeenCalledWith({ source: pngBuffer });
    expect(mockElectron.clipboard.write).not.toHaveBeenCalled();
  });

  it('两套接口都不可用时应抛出错误而非静默跳过写入', async () => {
    delete mockElectron.clipboard.writeImage;
    mockElectron.ClipboardItem = undefined;

    await expect(writePngToClipboard(pngBuffer)).rejects.toThrow('剪贴板图像写入接口');
  });
});
