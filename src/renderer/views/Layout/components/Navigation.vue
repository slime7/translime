<template>
  <v-navigation-drawer
    class="navi-drawer"
    permanent
    width="73"
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

      <v-hover v-slot="{ isHovering, props }">
        <a
          href="javascript:;"
          class="navi-btn text-decoration-none d-block ease-animation"
          v-bind="props"
          @click="showNotification"
        >

          <v-avatar
            class="transition-radius"
            size="56"
            :color="isHovering ? 'primary' : 'grey-darken-2'"
            :rounded="isHovering ? 'xl' : 'circle'"
          >
            <v-icon :color="isHovering ? 'white' : 'primary'">notifications</v-icon>
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

      <div class="navi-panel pa-2">
        <navi-link
          v-for="plugin in pluginPages"
          :key="plugin.packageName"
          :to="plugin.windowMode ? null : { name: 'PluginPage', params: { packageName: plugin.packageName } }"
          :open="plugin.windowMode ? plugin.packageName : null"
          :image="plugin.icon ? plugin.icon : defaultIcon"
          :tooltip="plugin.title"
          :isDev="plugin.dev"
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
import defaultIcon from '../../../assets/plugin-default-image.png';

export default {
  name: 'LayoutNavigation',

  components: {
    NaviLink,
  },

  setup() {
    const store = useGlobalStore();
    const alert = useAlert();

    const pluginPages = computed(() => store.plugins.filter((p) => p.enabled && !(!p.ui && !p.windowUrl)));
    const showNotification = () => {
      alert.showDrawer();
    };

    return {
      pluginPages,
      defaultIcon,
      showNotification,
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
.transition-radius {
  transition-property: border-radius;
}

.navi-panel {
  :deep(.navi-btn) {
    height: 56px;
    & + .navi-btn {
      margin-top: 8px;
    }
  }
}
</style>
