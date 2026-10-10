/**
 * Translime SDK - MDE Window Runtime Helpers
 * 供插件在主进程为自定义 BrowserWindow / BrowserView / WebContentsView 一键接入 MDE 统一运行时与主题。
 */

import { createRequire } from 'node:module';

const req = typeof require !== 'undefined' ? require : createRequire(import.meta.url);

const getElectron = () => {
  try {
    return req('electron');
  } catch {
    return null;
  }
};

const getGlobalStore = () => {
  if (typeof global !== 'undefined' && global.mainStore) {
    return global.mainStore;
  }
  return null;
};

const checkIsolatedMode = () => (
  typeof process !== 'undefined'
  && process.env
  && Boolean(process.env.TRANSLIME_ISOLATED_PLUGIN)
);

const DEFAULT_DEV_ORIGIN = 'http://localhost:5173/';
const DEFAULT_PROD_PROTOCOL = 'app://.';

/**
 * 获取 MDE 统一运行时的资源 URL
 * @param {object} [options]
 * @param {string} [options.baseUrl] - 自定义基础 URL，未指定时按环境自动推断
 * @param {boolean} [options.isDev] - 是否为开发模式，未指定时通过 process.env.NODE_ENV 推断
 * @returns {{ vue: string, mdeJs: string, mdeCss: string, mdeTailwindCss: string, bootstrapJs: string }}
 */
export function getMdeRuntimeUrls(options = {}) {
  const isDev = typeof options.isDev === 'boolean'
    ? options.isDev
    : process.env.NODE_ENV === 'development';

  const base = options.baseUrl || (isDev ? DEFAULT_DEV_ORIGIN : DEFAULT_PROD_PROTOCOL);
  const normalize = (path) => new URL(path, base.endsWith('/') ? base : `${base}/`).href;

  return {
    vue: normalize('libs/vue/vue.esm-browser.js'),
    mdeJs: normalize('libs/mde/mde.esm.js'),
    mdeCss: normalize('libs/mde/mde.css'),
    mdeTailwindCss: normalize('libs/mde/mde-tailwind.css'),
    bootstrapJs: normalize('libs/mde/bootstrap.js'),
  };
}

/**
 * 获取可用于 <script type="importmap"> 的 JSON 对象
 * @param {object} [options]
 * @returns {{ imports: { vue: string, 'mde-vue': string } }}
 */
export function getMdeImportMap(options = {}) {
  const urls = getMdeRuntimeUrls(options);
  return {
    imports: {
      vue: urls.vue,
      'mde-vue': urls.mdeJs,
    },
  };
}

/**
 * 获取可直接内联到 HTML <head> 中的统一运行时代码片段（包含 importmap、css 链接与 bootstrap 引导）
 * @param {object} [options]
 * @returns {string}
 */
export function getMdeHtmlSnippet(options = {}) {
  const urls = getMdeRuntimeUrls(options);
  const importMap = JSON.stringify(getMdeImportMap(options), null, 2);
  return `<!-- translime unified mde runtime -->
<link rel="stylesheet" href="${urls.mdeCss}">
<script type="importmap">
${importMap}
</script>
<script type="module" src="${urls.bootstrapJs}"></script>
`;
}

/**
 * 将任意 Window/View 对象归一化提取其 WebContents
 * @param {any} target
 * @returns {import('electron').WebContents|null}
 */
const resolveWebContents = (target) => {
  if (!target) return null;
  if (typeof target.insertCSS === 'function' && typeof target.executeJavaScript === 'function') {
    return target;
  }
  if (target.webContents && typeof target.webContents.insertCSS === 'function') {
    return target.webContents;
  }
  return null;
};

/**
 * 为任意 BrowserWindow / BrowserView / WebContentsView 注入 MDE 运行时与动态主题
 * @param {any} winOrWebContents - 目标窗口或 WebContents
 * @param {object} [options]
 * @param {boolean} [options.injectCss=true] - 是否在页面就绪后注入 mde.css
 * @param {boolean} [options.injectTheme=true] - 是否自动注入当前宿主 M3 主题 CSS 变量
 * @param {boolean} [options.syncTheme=true] - 是否监听宿主主题变更并实时推送更新
 * @param {boolean} [options.bootstrap=false] - 是否通过 executeJavaScript 自动执行 bootstrap.js
 * @returns {{ remove: () => void, updateTheme: () => Promise<void> }}
 */
export function setupMdeWindow(winOrWebContents, options = {}) {
  if (checkIsolatedMode()) {
    throw new Error('setupMdeWindow 在隔离模式下不可用，请在主进程中使用或去掉 isolated 声明');
  }

  const webContents = resolveWebContents(winOrWebContents);
  if (!webContents) {
    throw new Error('setupMdeWindow: 无法从参数中解析有效的 WebContents 对象');
  }

  const electron = getElectron();
  const nativeTheme = electron?.nativeTheme;

  const {
    injectCss = true,
    injectTheme = true,
    syncTheme = true,
    bootstrap = false,
  } = options;

  let lastInsertedThemeKey = null;
  let isDestroyed = false;

  const getThemeCss = () => {
    const store = getGlobalStore();
    if (store && typeof store.getMatThemeCss === 'function') {
      return store.getMatThemeCss();
    }
    // 降级保底：使用基础 M3 CSS
    const isDark = nativeTheme ? nativeTheme.shouldUseDarkColors : false;
    return `:root {
  --mat-sys-color-primary: ${isDark ? '#a8c8ff' : '#20a6fc'};
  --mat-sys-color-surface: ${isDark ? '#121316' : '#f9f9fc'};
  --mat-sys-color-on-surface: ${isDark ? '#e2e2e6' : '#1a1c1e'};
}`;
  };

  const applyTheme = async () => {
    if (isDestroyed || webContents.isDestroyed()) return;
    try {
      const themeCss = getThemeCss();
      // 如果已有上次插入的 key，先移除再插入，避免规则重复堆积
      if (lastInsertedThemeKey && typeof webContents.removeInsertedCSS === 'function') {
        try {
          await webContents.removeInsertedCSS(lastInsertedThemeKey);
        } catch {
          // ignore
        }
      }
      lastInsertedThemeKey = await webContents.insertCSS(themeCss);
    } catch {
      // 窗口可能正在跳转或关闭，静默捕获
    }
  };

  const onDomReady = async () => {
    if (isDestroyed || webContents.isDestroyed()) return;

    if (injectCss) {
      // 注入基础样式链接或类库样式
      try {
        const urls = getMdeRuntimeUrls(options);
        await webContents.executeJavaScript(`
          if (!document.querySelector('link[data-translime-mde-css]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = ${JSON.stringify(urls.mdeCss)};
            link.setAttribute('data-translime-mde-css', 'true');
            document.head.appendChild(link);
          }
        `).catch(() => {});
      } catch {
        // ignore
      }
    }

    if (injectTheme) {
      await applyTheme();
    }

    if (bootstrap) {
      try {
        const urls = getMdeRuntimeUrls(options);
        await webContents.executeJavaScript(`
          import(${JSON.stringify(urls.bootstrapJs)}).catch((e) => {
            console.error('[translime-sdk] MDE bootstrap 执行失败', e);
          });
        `).catch(() => {});
      } catch {
        // ignore
      }
    }
  };

  webContents.on('dom-ready', onDomReady);

  // 监听主题变更
  let themeHandler = null;
  if (syncTheme && nativeTheme) {
    themeHandler = () => {
      applyTheme();
    };
    nativeTheme.on('updated', themeHandler);
  }

  const cleanup = () => {
    isDestroyed = true;
    if (!webContents.isDestroyed()) {
      webContents.removeListener('dom-ready', onDomReady);
    }
    if (themeHandler && nativeTheme) {
      nativeTheme.removeListener('updated', themeHandler);
      themeHandler = null;
    }
  };

  webContents.once('destroyed', cleanup);

  return {
    remove: cleanup,
    updateTheme: applyTheme,
  };
}
