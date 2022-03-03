import Vue from 'vue';
import VueCompositionAPI from '@vue/composition-api';
import PluginWindow from './PluginWindow.vue';
import vuetify from './plugins/vuetify';

Vue.use(VueCompositionAPI);

Vue.config.productionTip = false;

new Vue({
  vuetify,
  render: (h) => h(PluginWindow),
}).$mount('#app');
