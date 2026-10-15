import { createApp } from 'vue';
import { createMatUi } from 'mde-vue';
import MirrorApp from './mirror-app.vue';
import './mirror.css';

// 画面窗口固定深色主题
const app = createApp(MirrorApp);
app.use(createMatUi({ theme: { mode: 'dark' } }));
app.mount('#app');
