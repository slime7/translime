<template>
  <v-navigation-drawer
    class="navi-drawer"
    color="surface-container-low"
    permanent
    width="73"
  >
    <div class="navi-panel p-2">
      <navi-link
        :to="{ name: 'Home' }"
        icon="home"
        tooltip="首页"
        data-test="nav-home"
      />

      <navi-link
        :to="{ name: 'Plugins' }"
        tooltip="插件"
        icon="extension"
        data-test="nav-plugins"
      >
        插件
      </navi-link>

      <navi-link
        :to="{ name: 'Setting' }"
        tooltip="设置"
        icon="settings"
        data-test="nav-setting"
      >
        设置
      </navi-link>

      <navi-link
        :to="{ name: 'About' }"
        tooltip="关于"
        icon="support"
        data-test="nav-about"
      >
        关于
      </navi-link>

      <v-hover v-slot="{ isHovering, props }">
        <a
          href="javascript:;"
          class="navi-btn no-underline block ease-animation"
          data-test="nav-notification"
          v-bind="props"
          @click="showNotification"
        >

          <v-avatar
            class="ease-animation"
            :class="[isHovering ? 'rounded-3xl' : 'rounded-full']"
            size="56"
            :color="isHovering ? 'primary-container' : 'secondary-container'"
            rounded
          >
            <v-icon :color="isHovering ? 'on-primary-container' : 'on-secondary-container'">notifications</v-icon>
          </v-avatar>

          <v-tooltip
            location="right"
            activator="parent"
          >
            <span>通知栏</span>
          </v-tooltip>
        </a>
      </v-hover>
    </div>

    <template v-if="pluginPages.length">
      <v-divider />

      <div class="navi-panel p-2">
        <navi-link
          v-for="plugin in pluginPages"
          :key="plugin.packageName"
          :to="plugin.windowMode ? null : { name: 'PluginPage', params: { packageName: plugin.packageName } }"
          :open="plugin.windowMode ? plugin.packageName : null"
          :image="plugin.icon ? plugin.icon : null"
          :tooltip="plugin.title"
          :is-dev="plugin.dev"
          :data-test="`nav-plugin-${plugin.packageName}`"
        >
          {{ plugin.title }}
        </navi-link>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<script>
import { computed } from 'vue';
import NaviLink from '@/views/Layout/components/NaviLink.vue';
import useGlobalStore from '@/store/globalStore';
import useAlert from '@/hooks/useAlert';

export default {
  name: 'LayoutNavigation',

  components: {
    NaviLink,
  },

  setup() {
    const store = useGlobalStore();
    const alert = useAlert();

    const pluginPages = computed(() => {
      const pinned = store.appSetting?.pinnedPlugins || [];
      return store.plugins.filter((p) => p.enabled && !(!p.ui && !p.windowUrl) && pinned.includes(p.packageName));
    });
    const showNotification = () => {
      alert.showDrawer();
    };

    return {
      pluginPages,
      showNotification,
    };
  },
};
</script>

<style>
.navi-drawer .v-navigation-drawer__content::-webkit-scrollbar {
  display: none;
}
</style>

<style scoped>
.navi-panel :deep(.navi-btn) {
  height: 56px;
}

.navi-panel :deep(.navi-btn) + .navi-btn {
  margin-top: 8px;
}
</style>
