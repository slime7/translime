import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

import { dispatchMenuAction } from '@main/core/menuRegistry';
import buildTextEditMenu from '@main/core/textEditMenu';

const { mockClipboard } = vi.hoisted(() => ({
  mockClipboard: {
    readText: vi.fn(() => 'clipboard text'),
    writeText: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  clipboard: mockClipboard,
}));

const createSender = (overrides = {}) => ({
  isDestroyed: vi.fn(() => false),
  undo: vi.fn(),
  redo: vi.fn(),
  cut: vi.fn(),
  copy: vi.fn(),
  paste: vi.fn(),
  ...overrides,
});

describe('textEditMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClipboard.readText.mockReturnValue('clipboard text');
  });

  it('应该生成可序列化的菜单描述，分隔线位于重做与剪切之间', () => {
    const { items } = buildTextEditMenu(createSender(), { selectedText: 'selected' });

    expect(items.map((item) => item.id ?? item.type)).toEqual([
      'undo',
      'redo',
      'separator',
      'cut',
      'copy',
      'paste',
    ]);
    // 菜单描述经由 IPC 结构化克隆传输，不允许携带函数
    expect(JSON.parse(JSON.stringify(items))).toEqual(items);
  });

  it('有选中文本时剪切和复制可用，否则禁用', () => {
    const withSelection = buildTextEditMenu(createSender(), { selectedText: 'text' });
    const enabledById = Object.fromEntries(
      withSelection.items.filter((item) => item.id).map((item) => [item.id, item.enabled]),
    );
    expect(enabledById.cut).toBe(true);
    expect(enabledById.copy).toBe(true);

    const withoutSelection = buildTextEditMenu(createSender(), {});
    const disabledById = Object.fromEntries(
      withoutSelection.items.filter((item) => item.id).map((item) => [item.id, item.enabled]),
    );
    expect(disabledById.cut).toBe(false);
    expect(disabledById.copy).toBe(false);
  });

  it('剪贴板为空时粘贴应禁用', () => {
    mockClipboard.readText.mockReturnValue('');

    const { items } = buildTextEditMenu(createSender(), {});
    const paste = items.find((item) => item.id === 'paste');

    expect(paste.enabled).toBe(false);
  });

  it('快捷键应转换为 Ctrl 加空格的展示文本', () => {
    const { items } = buildTextEditMenu(createSender(), {});

    expect(items.find((item) => item.id === 'copy').shortcut).toBe('Ctrl C');
  });

  it('点击动作应分发给原 webContents 对应的编辑方法', () => {
    // 菜单动作一次性消费（点击叶子项后菜单关闭），每个动作各用一份新菜单
    const copySender = createSender();
    const { menuId: copyMenuId } = buildTextEditMenu(copySender, { selectedText: 'text' });
    expect(dispatchMenuAction(copyMenuId, 'copy')).toBe(true);
    expect(copySender.copy).toHaveBeenCalledTimes(1);
    expect(copySender.cut).not.toHaveBeenCalled();

    const pasteSender = createSender();
    const { menuId: pasteMenuId } = buildTextEditMenu(pasteSender, {});
    expect(dispatchMenuAction(pasteMenuId, 'paste')).toBe(true);
    expect(pasteSender.paste).toHaveBeenCalledTimes(1);
  });

  it('webContents 已销毁时动作不应再执行', () => {
    const sender = createSender({ isDestroyed: vi.fn(() => true) });
    const { menuId } = buildTextEditMenu(sender, { selectedText: 'text' });

    dispatchMenuAction(menuId, 'cut');

    expect(sender.cut).not.toHaveBeenCalled();
  });
});
