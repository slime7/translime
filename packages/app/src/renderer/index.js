import { createApp } from 'vue';
import { createPinia } from 'pinia';
import '@/assets/styles/app.css';
import vuetify from '@/plugins/vuetify';
import '@/plugins/vuetifyCompat';
import matUi from '@/plugins/matUi';
import '@/assets/styles/tailwind.css';
import App from './App.vue';
import router from './router';
import createNaviDirective from './plugins/directive/navi';
import { installPluginStyleIsolation } from './utils/pluginStyleIsolation';
import waitForCriticalFonts from './utils/fonts';

installPluginStyleIsolation();

// 与渲染进程启动并行预载首屏图标字体，缩短 main-renderer-ready 前的等待
waitForCriticalFonts();

const pinia = createPinia();

const app = createApp(App);
app
  .use(router)
  .use(pinia)
  .use(vuetify)
  .use(matUi)
  .directive('navi', createNaviDirective(app))
  .mount('#app');
