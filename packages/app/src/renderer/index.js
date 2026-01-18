import { createApp } from 'vue';
import { createPinia } from 'pinia';
import '@/assets/styles/app.scss';
import vuetify from '@/plugins/vuetify';
import '@/assets/styles/tailwind.css';
import App from './App.vue';
import router from './router';
import createNaviDirective from './plugins/directive/navi';

const pinia = createPinia();

const app = createApp(App);
app
  .use(router)
  .use(pinia)
  .use(vuetify)
  .directive('navi', createNaviDirective(app))
  .mount('#app');
