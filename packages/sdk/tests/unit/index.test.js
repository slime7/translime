import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defineIpcHandlers,
  openLink,
  useIpc,
} from '../../src/index';
import {
  createMockIpc,
  initPreviewMock,
  setPreviewIpcMocks,
} from '../../src/preview-mock';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('defineIpcHandlers', () => {
  it('合法 handler 数组原样返回，保持宿主注册行为不变', () => {
    const handler = () => async () => ({ ok: true });
    const handlers = [{ type: 'get-data', handler }];

    expect(defineIpcHandlers(handlers)).toBe(handlers);
  });

  it('type 缺失、handler 缺失或 type 带 @ 后缀时立即抛错，避免问题延迟到插件激活', () => {
    // 防止的回归：手写 manifest 时把 '事件名@插件ID' 整串填进 type，
    // 宿主会注册出 'a@b@插件ID' 通道，运行期才表现为 UI 调用路由失败
    expect(() => defineIpcHandlers([{ handler: () => () => {} }])).toThrow(/type/);
    expect(() => defineIpcHandlers([{ type: 'get-data' }])).toThrow(/handler/);
    expect(() => defineIpcHandlers([{ type: 'get-data@translime-plugin-x', handler: () => () => {} }])).toThrow(/@/);
    expect(() => defineIpcHandlers('not-an-array')).toThrow(/数组/);
  });
});

describe('useIpc(pluginId) 事件名自动补全', () => {
  const createBaseIpcSpy = () => ({
    invoke: vi.fn(async () => 'ok'),
    send: vi.fn(),
    on: vi.fn(),
    detach: vi.fn(),
  });

  it('不传 pluginId 时返回原始客户端，事件名不做任何改写', () => {
    const baseIpc = createBaseIpcSpy();
    vi.stubGlobal('window', { electron: { useIpc: () => baseIpc } });

    expect(useIpc()).toBe(baseIpc);
  });

  it('无 window.electron 环境返回 null', () => {
    vi.stubGlobal('window', {});
    expect(useIpc('translime-plugin-x')).toBeNull();
  });

  it('invoke / send / on / detach 自动补全 @插件ID 后缀', () => {
    const baseIpc = createBaseIpcSpy();
    vi.stubGlobal('window', { electron: { useIpc: () => baseIpc } });

    const ipc = useIpc('translime-plugin-x');
    ipc.invoke('get-data', 1, 2);
    ipc.send('event-name', { a: 1 });
    ipc.on('push-event', () => {});
    ipc.detach('push-event');

    expect(baseIpc.invoke).toHaveBeenCalledWith('get-data@translime-plugin-x', 1, 2);
    expect(baseIpc.send).toHaveBeenCalledWith('event-name@translime-plugin-x', { a: 1 });
    expect(baseIpc.on).toHaveBeenCalledWith('push-event@translime-plugin-x', expect.any(Function));
    expect(baseIpc.detach).toHaveBeenCalledWith('push-event@translime-plugin-x');
  });

  it('显式带 @ 的事件名保持原样，兼容存量手拼代码', () => {
    const baseIpc = createBaseIpcSpy();
    vi.stubGlobal('window', { electron: { useIpc: () => baseIpc } });

    useIpc('translime-plugin-x').invoke('get-data@translime-plugin-x');

    expect(baseIpc.invoke).toHaveBeenCalledWith('get-data@translime-plugin-x');
  });
});

describe('openLink 参数归一化', () => {
  it('字符串入参包装为 { url } 传给宿主桥，匹配 OPEN_LINK 通道的对象签名', () => {
    // 防止的回归：按文档签名传裸字符串时参数被原样透传，
    // 宿主 handler 从字符串解构 url 得到 undefined，链接点击后浏览器不打开且无报错
    const openLinkSpy = vi.fn(async () => undefined);
    vi.stubGlobal('window', { electron: { openLink: openLinkSpy } });

    openLink('https://rclone.org/downloads/');

    expect(openLinkSpy).toHaveBeenCalledWith({ url: 'https://rclone.org/downloads/' });
  });

  it('{ url } 对象入参原样透传，兼容存量插件写法', () => {
    const openLinkSpy = vi.fn(async () => undefined);
    vi.stubGlobal('window', { electron: { openLink: openLinkSpy } });

    openLink({ url: 'https://github.com/' });

    expect(openLinkSpy).toHaveBeenCalledWith({ url: 'https://github.com/' });
  });

  it('无 window.electron 环境返回 null', async () => {
    vi.stubGlobal('window', {});

    await expect(openLink('https://github.com/')).resolves.toBeNull();
  });
});

describe('preview 声明式 IPC mock', () => {
  it('invoke 命中 mock 表时返回其返回值（支持 Promise），未命中返回 null', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const ipc = createMockIpc({
        'get-data': async (id) => ({ id, from: 'mock' }),
      });

      await expect(ipc.invoke('get-data@translime-plugin-x', 7)).resolves.toEqual({
        id: 7,
        from: 'mock',
      });
      // 带后缀的事件名按 @ 前的名称回退匹配
      await expect(ipc.invoke('unknown-event')).resolves.toBeNull();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('startPreview 前插件代码已触发过 mock 初始化时，仍能注入 ipcMocks', () => {
    // 防止的回归：SDK 导入副作用先以空表初始化 mock 环境，
    // startPreview 再传 ipcMocks 时若不更新活动 mock 表，声明式 mock 会全部失效
    vi.stubGlobal('window', {});
    initPreviewMock();

    setPreviewIpcMocks({ 'get-data': () => 'mocked' });

    return window.electron.useIpc().invoke('get-data@translime-plugin-x').then((result) => {
      expect(result).toBe('mocked');
    });
  });

  it('未初始化 mock 环境时 setPreviewIpcMocks 为空操作', async () => {
    // resetModules 拿到未初始化的独立模块实例，避免复用上一个用例的模块级状态
    vi.resetModules();
    const fresh = await import('../../src/preview-mock');

    expect(() => fresh.setPreviewIpcMocks({ 'get-data': () => 1 })).not.toThrow();
  });
});
