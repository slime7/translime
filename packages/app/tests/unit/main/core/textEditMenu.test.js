import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

import { dispatchMenuAction } from '@main/core/menuRegistry';
import buildTextEditMenu from '@main/core/textEditMenu';

const { mockClipboard } = vi.hoisted(() => ({
  mockClipboard: {
    readText: vi.fn(async () => 'clipboard text'),
    writeText: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:/mock-userdata'),
  },
  clipboard: mockClipboard,
}));

// menuRegistry（textEditMenu 的动作经它分发）引入 logger，其模块链需要 store 桩
vi.mock('@main/utils/useMainStore', () => ({
  default: {
    config: {
      get: vi.fn((key, defaultValue) => defaultValue),
      set: vi.fn(),
    },
    APP_VERSION: '0.0.0-test',
    APPDATA_PATH: 'C:/mock-userdata',
    TEMP_DIR: 'C:/mock-temp',
  },
}));

vi.mock('@main/utils/logger', () => ({
  default: {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
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
    mockClipboard.readText.mockResolvedValue('clipboard text');
  });

  it('应该生成可序列化的菜单描述，分隔线位于重做与剪切之间', async () => {
    const { items } = await buildTextEditMenu(createSender(), { selectedText: 'selected' });

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

  it('有选中文本时剪切和复制可用，否则禁用', async () => {
    const withSelection = await buildTextEditMenu(createSender(), { selectedText: 'text' });
    const enabledById = Object.fromEntries(
      withSelection.items.filter((item) => item.id).map((item) => [item.id, item.enabled]),
    );
    expect(enabledById.cut).toBe(true);
    expect(enabledById.copy).toBe(true);

    const withoutSelection = await buildTextEditMenu(createSender(), {});
    const disabledById = Object.fromEntries(
      withoutSelection.items.filter((item) => item.id).map((item) => [item.id, item.enabled]),
    );
    expect(disabledById.cut).toBe(false);
    expect(disabledById.copy).toBe(false);
  });

  it('剪贴板为空时粘贴应禁用', async () => {
    mockClipboard.readText.mockResolvedValue('');

    const { items } = await buildTextEditMenu(createSender(), {});
    const paste = items.find((item) => item.id === 'paste');

    expect(paste.enabled).toBe(false);
  });

  it('快捷键应转换为 Ctrl 加空格的展示文本', async () => {
    const { items } = await buildTextEditMenu(createSender(), {});

    expect(items.find((item) => item.id === 'copy').shortcut).toBe('Ctrl C');
  });

  it('点击动作应分发给原 webContents 对应的编辑方法', async () => {
    // 菜单动作一次性消费（点击叶子项后菜单关闭），每个动作各用一份新菜单
    const copySender = createSender();
    const { menuId: copyMenuId } = await buildTextEditMenu(copySender, { selectedText: 'text' });
    expect(dispatchMenuAction(copyMenuId, 'copy')).toBe(true);
    expect(copySender.copy).toHaveBeenCalledTimes(1);
    expect(copySender.cut).not.toHaveBeenCalled();

    const pasteSender = createSender();
    const { menuId: pasteMenuId } = await buildTextEditMenu(pasteSender, {});
    expect(dispatchMenuAction(pasteMenuId, 'paste')).toBe(true);
    expect(pasteSender.paste).toHaveBeenCalledTimes(1);
  });

  it('webContents 已销毁时动作不应再执行', async () => {
    const sender = createSender({ isDestroyed: vi.fn(() => true) });
    const { menuId } = await buildTextEditMenu(sender, { selectedText: 'text' });

    dispatchMenuAction(menuId, 'cut');

    expect(sender.cut).not.toHaveBeenCalled();
  });
});
