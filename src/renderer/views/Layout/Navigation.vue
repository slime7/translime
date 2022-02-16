<template>
  <v-navigation-drawer
    class="navi-drawer"
    app
    permanent
    width="72px"
  >
    <div class="navi-panel pa-2">
      <navi-link
        :to="{ name: 'Home' }"
        icon="home"
        tooltip="首页"
      />

      <navi-link
        :to="{ name: 'Plugins' }"
        tooltip="插件"
      >
        插件
      </navi-link>

      <navi-link
        :to="{ name: 'About' }"
        tooltip="关于"
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
          :to="plugin.windowMode ? null : { name: 'PluginPage', params: { packageName: plugin.packageName } }"
          :open="plugin.windowMode ? { id: plugin.packageName, index: plugin.main } : null"
          :image="plugin.icon"
          :tooltip="plugin.title"
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
      return this.$store.state.plugins.filter((p) => p.enabled && !!p.main);
    },
  },
};
</script>

<style lang="scss">
.navi-drawer .v-navigation-drawer__content::-webkit-scrollbar {
  display: none;
}
</style>

<style scoped lang="scss">
.navi-panel > * + * {
  margin-top: 8px;
}
</style>
