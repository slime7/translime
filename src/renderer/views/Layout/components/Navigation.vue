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
        icon="extension"
      >
        插件
      </navi-link>

      <navi-link
        :to="{ name: 'Setting' }"
        tooltip="设置"
        icon="settings"
      >
        设置
      </navi-link>

      <navi-link
        :to="{ name: 'About' }"
        tooltip="关于"
        icon="support"
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
          :open="plugin.windowMode ? { id: plugin.packageName, windowUrl: plugin.windowUrl } : null"
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
import { computed } from '@vue/composition-api';
import NaviLink from '@/views/Layout/components/NaviLink.vue';
import useGlobalStore from '@/store/globalStore';

export default {
  name: 'LayoutNavigation',

  components: {
    NaviLink,
  },

  setup() {
    const store = useGlobalStore();

    const pluginPages = computed(() => store.plugins.filter((p) => p.enabled && !(!p.ui && !p.windowUrl)));

    return {
      pluginPages,
    };
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
