import { createApp } from 'vue';
import { createMatUi } from 'mde-vue';
import VirtualApp from './virtual-app.vue';
import './virtual.css';

// 画面窗口固定深色主题
const app = createApp(VirtualApp);
app.use(createMatUi({ theme: { mode: 'dark' } }));
app.mount('#app');
