import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import vuetify from './plugins/vuetify';
import createNaviDirective from './plugins/directive/navi';

const pinia = createPinia();

const app = createApp(App);
app
  .use(router)
  .use(pinia)
  .use(vuetify)
  .directive('navi', createNaviDirective(app))
  .mount('#app');
