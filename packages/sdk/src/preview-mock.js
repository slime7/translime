/**
 * Preview Mock 模块
 * 为 preview 模式提供 Electron API 的 mock 实现
 */

const STORAGE_PREFIX = 'translime-preview-settings:';

/**
 * Mock IPC 实现
 * @returns {Object}
 */
export function createMockIpc() {
  return {
    invoke: async (channel, ...args) => {
      console.log('[Preview Mock] ipc.invoke:', channel, args);
      return null;
    },
    send: (channel, ...args) => {
      console.log('[Preview Mock] ipc.send:', channel, args);
    },
    on: (channel, callback) => {
      console.log('[Preview Mock] ipc.on registered:', channel);
      return () => {
        console.log('[Preview Mock] ipc.on removed:', channel);
      };
    },
    once: (channel, callback) => {
      console.log('[Preview Mock] ipc.once registered:', channel);
    },
    removeListener: (channel, callback) => {
      console.log('[Preview Mock] ipc.removeListener:', channel);
    },
    removeAllListeners: (channel) => {
      console.log('[Preview Mock] ipc.removeAllListeners:', channel);
    },
  };
}

/**
 * Mock Dialog 实现
 * @returns {Object}
 */
export function createMockDialog() {
  return {
    showOpenDialog: async (options) => {
      console.log('[Preview Mock] showOpenDialog:', options);
      // 在 preview 模式下，使用原生 file input 模拟
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        if (options?.properties?.includes('openDirectory')) {
          input.webkitdirectory = true;
        }
        if (options?.properties?.includes('multiSelections')) {
          input.multiple = true;
        }
        if (options?.filters) {
          const accept = options.filters
            .flatMap((f) => f.extensions.map((ext) => `.${ext}`))
            .join(',');
          input.accept = accept;
        }
        input.onchange = () => {
          const filePaths = Array.from(input.files || []).map((f) => f.name);
          resolve({ canceled: filePaths.length === 0, filePaths });
        };
        input.oncancel = () => {
          resolve({ canceled: true, filePaths: [] });
        };
        input.click();
      });
    },
    showSaveDialog: async (options) => {
      console.log('[Preview Mock] showSaveDialog:', options);
      const fileName = prompt('保存文件名：', options?.defaultPath || 'file.txt');
      return {
        canceled: !fileName,
        filePath: fileName || undefined,
      };
    },
    showMessageBox: async (options) => {
      console.log('[Preview Mock] showMessageBox:', options);
      const result = confirm(options?.message || '');
      return { response: result ? 0 : 1 };
    },
    showErrorBox: (title, content) => {
      console.error('[Preview Mock] showErrorBox:', title, content);
      alert(`${title}\n\n${content}`);
    },
  };
}

/**
 * Mock Shell 实现
 * @returns {Object}
 */
export function createMockShell() {
  return {
    openExternal: async (url) => {
      console.log('[Preview Mock] shell.openExternal:', url);
      window.open(url, '_blank');
    },
    openPath: async (path) => {
      console.log('[Preview Mock] shell.openPath:', path);
      alert(`[Preview] 无法在浏览器中打开路径: ${path}`);
    },
    showItemInFolder: (path) => {
      console.log('[Preview Mock] shell.showItemInFolder:', path);
      alert(`[Preview] 无法在浏览器中显示文件夹: ${path}`);
    },
  };
}

/**
 * Mock Clipboard 实现
 * @returns {Object}
 */
export function createMockClipboard() {
  return {
    readText: async () => {
      try {
        return await navigator.clipboard.readText();
      } catch (e) {
        console.warn('[Preview Mock] clipboard.readText failed:', e);
        return '';
      }
    },
    writeText: async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        console.log('[Preview Mock] clipboard.writeText:', text);
      } catch (e) {
        console.warn('[Preview Mock] clipboard.writeText failed:', e);
      }
    },
    readImage: async () => {
      console.log('[Preview Mock] clipboard.readImage: not supported in preview');
      return null;
    },
    writeImage: async () => {
      console.log('[Preview Mock] clipboard.writeImage: not supported in preview');
    },
  };
}

/**
 * Mock Window Control 实现
 * @returns {Object}
 */
export function createMockWindowControl() {
  return {
    close: (windowId) => {
      console.log('[Preview Mock] windowControl.close:', windowId);
    },
    minimize: (windowId) => {
      console.log('[Preview Mock] windowControl.minimize:', windowId);
    },
    maximize: (windowId) => {
      console.log('[Preview Mock] windowControl.maximize:', windowId);
    },
    unmaximize: (windowId) => {
      console.log('[Preview Mock] windowControl.unmaximize:', windowId);
    },
    devtools: (windowId) => {
      console.log('[Preview Mock] windowControl.devtools:', windowId);
    },
    isMaximized: async (windowId) => {
      console.log('[Preview Mock] windowControl.isMaximized:', windowId);
      return false;
    },
  };
}

/**
 * Mock Plugin Settings 实现（使用 localStorage 持久化）
 * @returns {Object}
 */
export function createMockPluginSettings() {
  return {
    get: async (pluginId) => {
      const key = `${STORAGE_PREFIX}${pluginId}`;
      try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : {};
      } catch (e) {
        console.warn('[Preview Mock] getPluginSetting parse error:', e);
        return {};
      }
    },
    set: async (pluginId, settings) => {
      const key = `${STORAGE_PREFIX}${pluginId}`;
      try {
        localStorage.setItem(key, JSON.stringify(settings));
        console.log('[Preview Mock] setPluginSetting:', pluginId, settings);
      } catch (e) {
        console.warn('[Preview Mock] setPluginSetting error:', e);
      }
    },
  };
}

/**
 * Mock Logger 实现
 * @returns {Object}
 */
export function createMockLogger() {
  return {
    log: (...args) => console.log('[Preview]', ...args),
    info: (...args) => console.info('[Preview]', ...args),
    warn: (...args) => console.warn('[Preview]', ...args),
    error: (...args) => console.error('[Preview]', ...args),
    debug: (...args) => console.debug('[Preview]', ...args),
  };
}

/**
 * 创建完整的 mock electron 对象
 * @returns {Object}
 */
export function createMockElectron() {
  const mockIpc = createMockIpc();
  return {
    useIpc: () => mockIpc,
    dialog: createMockDialog(),
    shell: createMockShell(),
    clipboard: createMockClipboard(),
    openLink: async (url) => {
      console.log('[Preview Mock] openLink:', url);
      window.open(url, '_blank');
    },
    versions: {
      node: 'preview',
      chrome: navigator.userAgent.match(/Chrome\/([0-9.]+)/)?.[1] || 'unknown',
      electron: 'preview',
    },
    APP_ROOT: '/preview',
    APPDATA_PATH: '/preview/appdata',
  };
}

/**
 * 创建完整的 mock ts 对象
 * @returns {Object}
 */
export function createMockTs() {
  const pluginSettings = createMockPluginSettings();
  return {
    getPluginSetting: pluginSettings.get,
    setPluginSetting: pluginSettings.set,
    windowControl: createMockWindowControl(),
    logger: createMockLogger(),
    net: {
      request: async (url, options) => {
        console.log('[Preview Mock] net.request:', url, options);
        try {
          const response = await fetch(url, options);
          return {
            ok: response.ok,
            status: response.status,
            data: await response.text(),
          };
        } catch (e) {
          return { ok: false, status: 0, error: e.message };
        }
      },
    },
  };
}

/**
 * 初始化 preview mock 环境
 * 将 mock 对象注入到 window
 */
export function initPreviewMock() {
  if (typeof window === 'undefined') {
    return;
  }

  // 只在未定义时注入，避免覆盖真实环境
  if (!window.electron) {
    window.electron = createMockElectron();
    console.log('[Preview Mock] window.electron injected');
  }

  if (!window.ts) {
    window.ts = createMockTs();
    console.log('[Preview Mock] window.ts injected');
  }
}

/**
 * 检查当前是否为 preview 模式
 * @returns {boolean}
 */
export function isPreviewMode() {
  // 通过 Vite define 注入的全局变量判断
  // eslint-disable-next-line no-undef
  if (typeof __TRANSLIME_PREVIEW__ !== 'undefined' && __TRANSLIME_PREVIEW__) {
    return true;
  }
  // 备用检测：检查是否在普通浏览器环境中运行
  if (typeof window !== 'undefined' && !window.electron && !window.ts) {
    return true;
  }
  return false;
}
