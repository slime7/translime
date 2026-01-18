<template>
  <v-container class="home">
    <div class="flex flex-col justify-center">
      <h1 class="text-center">
        translime
      </h1>

      <p class="text-center">
        一个基于 <code>electron</code> 实现的插件加载器。
      </p>

      <v-row class="mt-2">
        <v-col cols="6">
          <v-card flat rounded class="rounded-2xl">
            <v-list-item lines="two" link v-navi="{ name: 'Plugins' }">
              <v-list-item-title>插件 · 已安装 {{ pluginCount }} 个</v-list-item-title>
              <v-list-item-subtitle>安装、管理插件</v-list-item-subtitle>
            </v-list-item>
          </v-card>
        </v-col>

        <v-col cols="6">
          <v-card flat rounded class="rounded-2xl">
            <v-list-item lines="two" link v-navi="{ name: 'Setting' }">
              <v-list-item-title>设置</v-list-item-title>
              <v-list-item-subtitle>插件和用户设置</v-list-item-subtitle>
            </v-list-item>
          </v-card>
        </v-col>
      </v-row>

      <HelloWorld v-if="isDev" msg="Hello Vue 3 + Vite" />
    </div>
  </v-container>
</template>

<script>
import { computed } from 'vue';
import useGlobalStore from '../store/globalStore';
import HelloWorld from '../components/HelloWorld.vue';

export default {
  name: 'AppHome',

  components: {
    HelloWorld,
  },

  setup() {
    const store = useGlobalStore();

    const pluginCount = computed(() => store.plugins.length);

    return {
      isDev: process.env.NODE_ENV === 'development',
      pluginCount,
    };
  },
};
</script>
