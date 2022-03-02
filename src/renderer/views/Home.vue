<template>
  <v-container class="home">
    <div class="d-flex flex-column justify-center">
      <h1>translime</h1>

      <p>一个基于 <code>electron</code> 实现的插件加载器。</p>

      <v-row>
        <v-col cols="6">
          <v-sheet class="rounded overflow-hidden" outlined>
            <v-list-item :to="{ name: 'Plugins' }">
              <v-list-item-content>
                <v-list-item-title>插件</v-list-item-title>
                <v-list-item-subtitle>安装、管理插件</v-list-item-subtitle>
              </v-list-item-content>
            </v-list-item>
          </v-sheet>
        </v-col>

        <v-col cols="6">
          <v-sheet class="rounded overflow-hidden" outlined>
            <v-list-item :to="{ name: 'Setting' }">
              <v-list-item-content>
                <v-list-item-title>设置</v-list-item-title>
                <v-list-item-subtitle>插件和用户设置</v-list-item-subtitle>
              </v-list-item-content>
            </v-list-item>
          </v-sheet>
        </v-col>
      </v-row>

      <HelloWorld v-if="isDev" msg="Hello Vue 2 + Vite" />
    </div>
  </v-container>
</template>

<script>
import HelloWorld from '../components/HelloWorld.vue';

export default {
  name: 'Home',

  components: {
    HelloWorld,
  },

  setup() {
    return {
      isDev: process.env.NODE_ENV === 'development',
    };
  },
};
</script>
