import * as mdeVue from 'mde-vue';
import { createMatUi } from 'mde-vue';
import {
  DEFAULT_THEME_COLOR_SOURCE,
  DEFAULT_THEME_COLOR_VARIANT,
  toMatSchemeVariant,
} from '@/utils/themeColorConfig';

/**
 * 宿主 UI 框架（Material 3 Expressive）。
 * 插件 UI 仍基于 Vuetify（见 plugins/vuetify.js），本插件只服务宿主自身组件。
 */
const matUi = createMatUi({
  iconClass: 'material-icons',
  theme: {
    mode: 'light',
    seedColor: DEFAULT_THEME_COLOR_SOURCE,
    schemeVariant: toMatSchemeVariant(DEFAULT_THEME_COLOR_VARIANT),
  },
  // tooltip 延迟打开：避免首次挂载 tooltip 的渲染停顿吃掉同瞬间的 hover 形变动画
  defaults: {
    tooltip: {
      openDelay: 600,
    },
  },
});

const components = {};
const directives = {};
// mde-vue 根入口的命令式函数（snackbar/toast/dialog/alert/confirm/prompt）
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
 * 插件 UI 的 mde-vue 运行时（与 window.vuetify$ 对称）。
 * 插件构建时由 SDK 注入 window.mde$ 的解构（不打包 mde-vue），
 * 同时暴露命令式函数与主题控制器供插件使用或跟随宿主主题。
 */
if (!window.mde$) {
  window.mde$ = {
    components,
    directives,
    functions,
    theme: matUi.theme,
  };
}

export default matUi;
