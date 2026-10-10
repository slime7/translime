/* eslint-disable import-x/no-unresolved, import-x/extensions */
import * as mdeVue from './mde.esm.js';
import { createMatUi } from './mde.esm.js';

/**
 * 宿主提供的共享 mde 运行时启动脚本。
 * 供宿主主窗口、独立窗口（BrowserWindow/BrowserView）、webview 与插件页面使用。
 */

const matUi = createMatUi({
  iconClass: 'material-icons',
});

const components = {};
const directives = {};
const MAT_FUNCTION_NAMES = new Set(['snackbar', 'toast', 'dialog', 'alert', 'confirm', 'prompt']);
const functions = {};

Object.entries(mdeVue).forEach(([name, exported]) => {
  if (name === 'Intersection' || name === 'StateLayer') {
    directives[name] = exported;
    return;
  }
  if (MAT_FUNCTION_NAMES.has(name) && typeof exported === 'function') {
    functions[name] = exported;
    return;
  }
  if (/^(Mat|Mde)[A-Z]/.test(name)) {
    components[name] = exported;
  }
});

/**
 * 将 mde 运行时挂载到目标全局对象（默认 window.mde$）
 * @param {Window} [targetWindow=window]
 * @returns {object}
 */
export function setupMatRuntime(targetWindow = (typeof window !== 'undefined' ? window : null)) {
  const win = targetWindow;
  if (!win) {
    return null;
  }
  if (!win.mde$) {
    win.mde$ = {
      components,
      directives,
      functions,
      theme: matUi.theme,
      createMatUi,
      ...mdeVue,
    };
  }
  return win.mde$;
}

/**
 * 将 matUi 插件安装到目标 Vue App 实例上
 * @param {import('vue').App} app
 */
export function setupMatApp(app) {
  if (app && typeof app.use === 'function') {
    app.use(matUi);
  }
}

/**
 * 快速向 document.documentElement 注入主题变量令牌
 * @param {Record<string, string>} tokens
 * @param {Document} [doc=document]
 */
export function applyMatThemeTokens(tokens, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || !tokens) {
    return;
  }
  const root = doc.documentElement;
  Object.entries(tokens).forEach(([key, val]) => {
    if (key.startsWith('--mat-sys-color-') || key.startsWith('--mat-')) {
      root.style.setProperty(key, val);
    }
  });
}

// 自动在全局环境初始化
if (typeof window !== 'undefined') {
  setupMatRuntime(window);
}

export {
  matUi,
  components,
  directives,
  functions,
};
export default matUi;
