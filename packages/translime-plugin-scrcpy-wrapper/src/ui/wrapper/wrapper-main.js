import { createApp } from 'vue';
import { createMatUi } from 'mde-vue';
import WrapperApp from './wrapper-app.vue';
import './wrapper.css';

// 画面窗口固定深色：视频区域与底条在亮色令牌下观感割裂，且不随宿主主题切换
const app = createApp(WrapperApp);
app.use(createMatUi({ theme: { mode: 'dark' } }));
app.mount('#app');
