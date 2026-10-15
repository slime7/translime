import { createApp } from 'vue';
import { createMatUi } from 'mde-vue';
import MirrorApp from './mirror-app.vue';
import './mirror.css';

// 主题令牌由宿主 setupMdeWindow 注入 :root 并跟随切换；
// mde-vue 控制器重定向到游离节点，避免其内联令牌覆盖宿主主题
const app = createApp(MirrorApp);
app.use(createMatUi({ theme: { mode: 'dark', target: document.createElement('div') } }));
app.mount('#app');
