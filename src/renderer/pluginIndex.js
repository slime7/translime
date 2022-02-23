import Vue from 'vue';
import PluginWindow from './PluginWindow.vue';
import vuetify from './plugins/vuetify';

Vue.config.productionTip = false;

new Vue({
  vuetify,
  render: (h) => h(PluginWindow),
}).$mount('#app');
