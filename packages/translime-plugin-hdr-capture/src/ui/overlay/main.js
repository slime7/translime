import { createApp } from 'vue';
import { createMatUi } from 'mde-vue';
import App from './App.vue';
import './index.css';

const app = createApp(App);
app.use(createMatUi());
app.mount('#app');
