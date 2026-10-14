import { createApp } from 'vue';
import { createMatUi } from 'mde-vue';
import WrapperApp from './wrapper-app.vue';

const app = createApp(WrapperApp);
app.use(createMatUi());
app.mount('#app');
