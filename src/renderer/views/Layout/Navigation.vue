<template>
  <v-navigation-drawer
    app
    permanent
    width="72px"
  >
    <div class="navi-panel pa-2">
      <navi-link
        :to="{ name: 'Home' }"
        icon="home"
      ></navi-link>

      <navi-link
        :to="{ name: 'Plugins' }"
      >
        插件
      </navi-link>

      <navi-link
        :to="{ name: 'About' }"
      >
        关于
      </navi-link>
    </div>

    <template v-if="pluginPages.length">
      <v-divider />

      <div class="navi-panel pa-2">
        <navi-link
          v-for="plugin in pluginPages"
          :key="plugin.packageName"
          :to="{ name: 'PluginPage', params: { packageName: plugin.packageName } }"
          :image="plugin.icon"
        >
          {{ plugin.title }}
        </navi-link>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<script>
import NaviLink from '@/views/Layout/components/NaviLink.vue';

export default {
  name: 'Navigation',

  components: {
    NaviLink,
  },

  computed: {
    pluginPages() {
      return this.$store.state.plugins.filter((p) => !!p.main);
    },
  },
};
</script>

<style scoped lang="scss">
.navi-panel > * + * {
  margin-top: 8px;
}
</style>
