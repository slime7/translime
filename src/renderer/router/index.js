import Vue from 'vue';
import VueRouter from 'vue-router';
import Base from '../views/Layout/Base.vue';

Vue.use(VueRouter);

const routes = [
  {
    path: '',
    component: Base,
    meta: { requiresAuth: true },
    children: [
      {
        path: '/',
        name: 'Home',
        component: () => import('@/views/Home.vue'),
      },
      {
        path: '/about',
        name: 'About',
        component: () => import('@/views/About.vue'),
      },
      {
        path: '/plugins',
        name: 'Plugins',
        component: () => import('@/views/plugins/Plugins.vue'),
      },
      {
        path: '/plugins/:packageName',
        name: 'PluginPage',
        component: () => import('@/views/plugins/PluginPage.vue'),
        props: true,
      },
    ],
  },
];

const router = new VueRouter({
  mode: 'hash',
  base: import.meta.env.Base,
  routes,
});

export default router;
