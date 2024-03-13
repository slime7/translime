import { createRouter, createWebHashHistory } from 'vue-router';
import LayoutBase from '../views/Layout/Base.vue';
import AppHome from '../views/Home.vue';
import AppAbout from '../views/About.vue';
import AppPlugins from '../views/plugins/Plugins.vue';
import AppSetting from '../views/Setting.vue';
import AppPluginPage from '../views/plugins/PluginPage.vue';

const routes = [
  {
    path: '/',
    component: LayoutBase,
    meta: {
      requiresAuth: true,
      keepAlive: true,
    },
    children: [
      {
        path: '',
        name: 'Home',
        component: AppHome,
      },
      {
        path: '/about',
        name: 'About',
        component: AppAbout,
      },
      {
        path: '/plugins',
        name: 'Plugins',
        component: AppPlugins,
      },
      {
        path: '/setting',
        name: 'Setting',
        component: AppSetting,
      },
      {
        path: '/plugins/:packageName',
        name: 'PluginPage',
        component: AppPluginPage,
        props: true,
      },
    ],
  },
];

const router = createRouter({
  history: createWebHashHistory(import.meta.env.Base),
  routes,
});

export default router;
