import { describe, expect, it, vi } from 'vitest';
import {
  getMdeRuntimeUrls,
  getMdeImportMap,
  getMdeHtmlSnippet,
  setupMdeWindow,
} from '../../src/windowRuntime';

describe('windowRuntime - URL & HTML Snippet 生成', () => {
  it('正确生成生产环境默认协议 URL', () => {
    const urls = getMdeRuntimeUrls({ isDev: false });
    expect(urls.vue).toBe('app://./libs/vue/vue.esm-browser.js');
    expect(urls.mdeJs).toBe('app://./libs/mde/mde.esm.js');
    expect(urls.mdeCss).toBe('app://./libs/mde/mde.css');
    expect(urls.bootstrapJs).toBe('app://./libs/mde/bootstrap.js');
  });

  it('正确生成开发环境 URL', () => {
    const urls = getMdeRuntimeUrls({ isDev: true });
    expect(urls.vue).toContain('http://localhost:5173/libs/vue/vue.esm-browser.js');
    expect(urls.mdeJs).toContain('http://localhost:5173/libs/mde/mde.esm.js');
  });

  it('生成合法有效的 importmap 对象', () => {
    const map = getMdeImportMap({ isDev: false });
    expect(map.imports.vue).toBe('app://./libs/vue/vue.esm-browser.js');
    expect(map.imports['mde-vue']).toBe('app://./libs/mde/mde.esm.js');
  });

  it('生成的 HTML snippet 包含 link、importmap 和 bootstrap 脚本', () => {
    const snippet = getMdeHtmlSnippet({ isDev: false });
    expect(snippet).toContain('<link rel="stylesheet" href="app://./libs/mde/mde.css">');
    expect(snippet).toContain('<script type="importmap">');
    expect(snippet).toContain('"mde-vue": "app://./libs/mde/mde.esm.js"');
    expect(snippet).toContain('<script type="module" src="app://./libs/mde/bootstrap.js"></script>');
  });
});

describe('windowRuntime - setupMdeWindow 行为验证', () => {
  it('对有效 WebContents 注册事件监听与样式注入', async () => {
    const callbacks = {};
    const mockWebContents = {
      insertCSS: vi.fn(async () => 'css-key-1'),
      removeInsertedCSS: vi.fn(async () => {}),
      executeJavaScript: vi.fn(async () => {}),
      on: vi.fn((event, cb) => {
        callbacks[event] = cb;
      }),
      once: vi.fn((event, cb) => {
        callbacks[event] = cb;
      }),
      removeListener: vi.fn(),
      isDestroyed: vi.fn(() => false),
    };

    const handle = setupMdeWindow(mockWebContents, { syncTheme: false, bootstrap: true });
    expect(mockWebContents.on).toHaveBeenCalledWith('dom-ready', expect.any(Function));

    // 模拟触发 dom-ready
    await callbacks['dom-ready']();
    expect(mockWebContents.insertCSS).toHaveBeenCalled();
    expect(mockWebContents.executeJavaScript).toHaveBeenCalled();

    handle.remove();
    expect(mockWebContents.removeListener).toHaveBeenCalledWith('dom-ready', expect.any(Function));
  });

  it('监听宿主 themeColor 与 theme 变更并触发 applyTheme 及派发事件', async () => {
    const storeListeners = {};
    const unsubs = [vi.fn(), vi.fn()];
    global.mainStore = {
      config: {
        get: vi.fn((key) => {
          if (key === 'setting.themeColor') return '#2196f3';
          if (key === 'setting.theme') return 'dark';
          return null;
        }),
        onDidChange: vi.fn((key, cb) => {
          storeListeners[key] = cb;
          return key === 'setting.themeColor' ? unsubs[0] : unsubs[1];
        }),
      },
    };

    const mockWebContents = {
      insertCSS: vi.fn(async () => 'css-key-theme'),
      removeInsertedCSS: vi.fn(async () => {}),
      executeJavaScript: vi.fn(async () => {}),
      send: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      isDestroyed: vi.fn(() => false),
    };

    const handle = setupMdeWindow(mockWebContents, { syncTheme: true });

    expect(global.mainStore.config.onDidChange).toHaveBeenCalledWith('setting.themeColor', expect.any(Function));
    expect(global.mainStore.config.onDidChange).toHaveBeenCalledWith('setting.theme', expect.any(Function));

    // 模拟宿主主题色改变
    await storeListeners['setting.themeColor']();
    expect(mockWebContents.insertCSS).toHaveBeenCalled();
    expect(mockWebContents.send).toHaveBeenCalledWith('translime:theme-updated', expect.objectContaining({
      css: expect.any(String),
    }));

    handle.remove();
    expect(unsubs[0]).toHaveBeenCalled();
    expect(unsubs[1]).toHaveBeenCalled();

    delete global.mainStore;
  });

  it('传入非法目标抛出明确错误', () => {
    expect(() => setupMdeWindow(null)).toThrow(/无法从参数中解析/);
    expect(() => setupMdeWindow({})).toThrow(/无法从参数中解析/);
  });
});
