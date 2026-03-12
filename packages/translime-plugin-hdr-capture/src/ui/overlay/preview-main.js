/**
 * Overlay Preview 模式入口
 * 在浏览器中预览 Overlay UI，不需要 Electron 环境
 */
import { createApp } from 'vue';
import { initOverlayPreviewMock } from './preview-mock';
import App from './App.vue';
import './index.css';

// 初始化 mock 环境
await initOverlayPreviewMock();

// 挂载应用
const app = createApp(App);
app.mount('#app');

// eslint-disable-next-line no-console
console.log('[Overlay Preview] 应用已挂载');
