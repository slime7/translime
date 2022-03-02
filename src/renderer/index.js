import Vue from 'vue';
import VueCompositionAPI from '@vue/composition-api';
import { createPinia, PiniaVuePlugin } from 'pinia';
import App from './App.vue';
import router from './router';
import vuetify from './plugins/vuetify';

Vue.use(VueCompositionAPI);
Vue.use(PiniaVuePlugin);
const pinia = createPinia();

Vue.config.productionTip = false;

new Vue({
  vuetify,
  router,
  pinia,
  render: (h) => h(App),
}).$mount('#app');
