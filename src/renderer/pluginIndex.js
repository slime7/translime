import { createApp } from 'vue';
import PluginWindow from './PluginWindow.vue';
import vuetify from './plugins/vuetify';

createApp(PluginWindow)
  .use(vuetify)
  .mount('#app');
