import Vue from 'vue';
import ipcService from './plugins/ipcService';
import PluginWindow from './PluginWindow.vue';
import vuetify from './plugins/vuetify';

Vue.config.productionTip = false;
Vue.use(ipcService);

new Vue({
  vuetify,
  render: (h) => h(PluginWindow),
}).$mount('#app');
