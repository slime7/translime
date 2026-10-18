/**
 * Preview 模式入口
 * 初始化 Vue + mde-vue 并挂载 Preview Shell
 */
// 必须在 mde-vue/styles.css 之前导入，确保 CSS layer 顺序正确
import './layers.css';
import 'mde-vue/styles.css';

import { createApp } from 'vue';
import { initPreviewMock, setPreviewIpcMocks } from '../preview-mock';
import PreviewApp from './App.vue';

const MAT_FUNCTION_NAMES = new Set(['snackbar', 'toast', 'dialog', 'alert', 'confirm', 'prompt']);

/**
 * 收集 mde-vue 根入口导出的组件、指令与命令式函数，
 * 按 `window.mde$` 的形状暴露给插件源码（与宿主注入的运行时一致）。
 * @param {object} matUi - createMatUi 返回的插件实例
 * @param {Record<string, any>} mdeVue - mde-vue 根入口的具名导出
 * @returns {{ components: object, directives: object, functions: object, theme: object }}
 */
const createMatRuntime = (matUi, mdeVue) => {
  const components = {};
  const directives = {};
  const functions = {};
  Object.entries(mdeVue).forEach(([name, exported]) => {
    if (name === 'Intersection' || name === 'StateLayer' || name === 'Ripple') {
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
  return {
    components,
    directives,
    functions,
    theme: matUi.theme,
  };
};

/**
 * 启动 Preview 模式
 * @param {Object} pluginComponent - 要预览的插件 Vue 组件
 * @param {Object} options - 可选配置
 * @param {string} options.mountId - 挂载元素 ID，默认 'app'
 * @param {Object} [options.ipcMocks] - 声明式 IPC mock handler 表
 *   （键为事件名，值为 (...args) => result），由 vite 插件
 *   `translimeSdk({ previewIpcMocks })` 指向的模块提供默认值
 */
export async function startPreview(pluginComponent, options = {}) {
  const { mountId = 'app', ipcMocks } = options;

  // 初始化 mock 环境（SDK 导入时的副作用可能已初始化过，这里只补齐 mock 表）
  initPreviewMock();
  if (ipcMocks) {
    setPreviewIpcMocks(ipcMocks);
  }

  // 初始化 mde-vue（与宿主保持一致），并提供插件运行时
  const mdeVue = await import('mde-vue');
  const matUi = mdeVue.createMatUi({
    iconClass: 'material-icons',
  });
  window.mde$ = createMatRuntime(matUi, mdeVue);

  // 设置插件组件到全局变量
  // eslint-disable-next-line no-underscore-dangle
  window.__PREVIEW_PLUGIN_COMPONENT__ = pluginComponent;

  // 创建并挂载应用
  const app = createApp(PreviewApp);
  app.use(matUi);

  // 挂载前确保 DOM 元素存在
  let mountEl = document.getElementById(mountId);
  if (!mountEl) {
    mountEl = document.createElement('div');
    mountEl.id = mountId;
    document.body.appendChild(mountEl);
  }

  app.mount(`#${mountId}`);

  console.log('[Preview] 插件预览模式已启动');

  return app;
}

export default startPreview;
