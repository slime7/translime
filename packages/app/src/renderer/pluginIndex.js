import { createApp } from 'vue';
import '@/assets/styles/app.scss';
import vuetify from '@/plugins/vuetify';
import '@/assets/styles/tailwind.css';
import PluginWindow from './PluginWindow.vue';

createApp(PluginWindow)
  .use(vuetify)
  .mount('#app');
