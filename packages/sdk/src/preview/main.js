/**
 * Preview 模式入口
 * 初始化 Vue + Vuetify 并挂载 Preview Shell
 */
// 必须在 vuetify/styles 之前导入，确保 CSS layer 顺序正确
import './layers.css';

import { createApp } from 'vue';
import { createVuetify } from 'vuetify';
import { zhHans } from 'vuetify/locale';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import { aliases, md } from 'vuetify/iconsets/md';
import { md3 } from 'vuetify/blueprints';
import 'vuetify/styles';

import { initPreviewMock } from '../preview-mock';
import PreviewApp from './App.vue';

/**
 * 启动 Preview 模式
 * @param {Object} pluginComponent - 要预览的插件 Vue 组件
 * @param {Object} options - 可选配置
 * @param {string} options.mountId - 挂载元素 ID，默认 'app'
 */
export async function startPreview(pluginComponent, options = {}) {
  const { mountId = 'app' } = options;

  // 初始化 mock 环境
  initPreviewMock();

  // 创建 Vuetify 实例（与主程序保持一致）
  const vuetify = createVuetify({
    components,
    directives,
    locale: {
      locale: 'zhHans',
      messages: { zhHans },
    },
    icons: {
      defaultSet: 'md',
      aliases,
      sets: { md },
    },
    theme: {
      defaultTheme: 'light',
      layers: true,
      themes: {
        light: {
          colors: {
            primary: '#00639b',
            'on-primary': '#ffffff',
            'primary-container': '#cee5ff',
            'on-primary-container': '#004a76',
            'inverse-primary': '#96cbff',
            'primary-fixed': '#cee5ff',
            'primary-fixed-dim': '#96cbff',
            'on-primary-fixed': '#001d33',
            'on-primary-fixed-variant': '#004a76',
            secondary: '#51606f',
            'on-secondary': '#ffffff',
            'secondary-container': '#d5e4f7',
            'on-secondary-container': '#3a4857',
            'secondary-fixed': '#d5e4f7',
            'secondary-fixed-dim': '#b9c8da',
            'on-secondary-fixed': '#0e1d2a',
            'on-secondary-fixed-variant': '#3a4857',
            tertiary: '#68587a',
            'on-tertiary': '#ffffff',
            'tertiary-container': '#eedbff',
            'on-tertiary-container': '#504061',
            'tertiary-fixed': '#eedbff',
            'tertiary-fixed-dim': '#d3bfe6',
            'on-tertiary-fixed': '#231533',
            'on-tertiary-fixed-variant': '#504061',
            error: '#ba1a1a',
            'on-error': '#ffffff',
            'error-container': '#ffdad6',
            'on-error-container': '#93000a',
            'surface-dim': '#dadada',
            surface: '#f9f9f9',
            'surface-bright': '#f9f9f9',
            'surface-container-lowest': '#ffffff',
            'surface-container-low': '#f3f3f3',
            'surface-container': '#eeeeee',
            'surface-container-high': '#e8e8e8',
            'surface-container-highest': '#e2e2e2',
            'on-surface': '#1b1b1b',
            'on-surface-variant': '#474747',
            outline: '#777777',
            'outline-variant': '#c6c6c6',
            'inverse-surface': '#303030',
            'inverse-on-surface': '#f1f1f1',
            'surface-variant': '#e2e2e2',
            'surface-tint': '#00639b',
            background: '#f9f9f9',
            'on-background': '#1b1b1b',
            shadow: '#000000',
            scrim: '#000000',
          },
          dark: false,
        },
        dark: {
          colors: {
            primary: '#96cbff',
            'on-primary': '#003353',
            'primary-container': '#004a76',
            'on-primary-container': '#cee5ff',
            'inverse-primary': '#00639b',
            'primary-fixed': '#cee5ff',
            'primary-fixed-dim': '#96cbff',
            'on-primary-fixed': '#001d33',
            'on-primary-fixed-variant': '#004a76',
            secondary: '#b9c8da',
            'on-secondary': '#233240',
            'secondary-container': '#3a4857',
            'on-secondary-container': '#d5e4f7',
            'secondary-fixed': '#d5e4f7',
            'secondary-fixed-dim': '#b9c8da',
            'on-secondary-fixed': '#0e1d2a',
            'on-secondary-fixed-variant': '#3a4857',
            tertiary: '#d3bfe6',
            'on-tertiary': '#382a49',
            'tertiary-container': '#504061',
            'on-tertiary-container': '#eedbff',
            'tertiary-fixed': '#eedbff',
            'tertiary-fixed-dim': '#d3bfe6',
            'on-tertiary-fixed': '#231533',
            'on-tertiary-fixed-variant': '#504061',
            error: '#ffb4ab',
            'on-error': '#690005',
            'error-container': '#93000a',
            'on-error-container': '#ffdad6',
            'surface-dim': '#131313',
            surface: '#131313',
            'surface-bright': '#393939',
            'surface-container-lowest': '#0e0e0e',
            'surface-container-low': '#1b1b1b',
            'surface-container': '#1f1f1f',
            'surface-container-high': '#2a2a2a',
            'surface-container-highest': '#353535',
            'on-surface': '#e2e2e2',
            'on-surface-variant': '#c6c6c6',
            outline: '#919191',
            'outline-variant': '#474747',
            'inverse-surface': '#e2e2e2',
            'inverse-on-surface': '#303030',
            'surface-variant': '#474747',
            'surface-tint': '#96cbff',
            background: '#131313',
            'on-background': '#e2e2e2',
            shadow: '#000000',
            scrim: '#000000',
          },
          dark: true,
        },
      },
    },
    defaults: {
      VBtn: {
        class: 'normal-case',
      },
      VSwitch: {
        color: 'primary',
        hideDetails: true,
        inset: true,
        trueIcon: 'check',
      },
      VCard: {
        color: 'surface-container',
      },
    },
    blueprint: md3,
  });

  // 将 Vuetify 组件和指令注入到 window，供 SDK 使用
  window.vuetify$ = {
    instance: vuetify,
    components,
    directives,
  };

  // 设置插件组件到全局变量
  window.__PREVIEW_PLUGIN_COMPONENT__ = pluginComponent;

  // 创建并挂载应用
  const app = createApp(PreviewApp);
  app.use(vuetify);

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
