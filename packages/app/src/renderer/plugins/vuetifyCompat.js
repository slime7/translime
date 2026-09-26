import * as components from 'vuetify/components';
import * as labsComponents from 'vuetify/labs/components';
import * as directives from 'vuetify/directives';

/**
 * 插件 UI 的 Vuetify 运行时。
 * 插件构建时由 SDK 注入 window.vuetify$ 的解构（不打包 vuetify），
 * 宿主在所有加载宿主页面的文档（主窗口、插件窗口、内嵌 webview）中提供该全局对象。
 */
if (!window.vuetify$) {
  window.vuetify$ = {
    components: {
      ...components,
      ...labsComponents,
    },
    directives,
  };
}

export default window.vuetify$;
