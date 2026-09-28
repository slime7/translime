<template>
  <aside class="navi-drawer flex-none h-full flex flex-col overflow-y-auto bg-surface-container-low">
    <div class="navi-panel p-2">
      <navi-link
        :to="{ name: 'PluginCenter' }"
        tooltip="插件中心"
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

      <mat-tooltip
        content="通知栏"
        location="right"
      >
        <template #activator>
          <a
            href="javascript:;"
            class="navi-btn no-underline block ease-animation"
            data-test="nav-notification"
            @click="showNotification"
          >
            <div class="navi-avatar flex items-center justify-center size-14 navi-avatar--round">
              <mat-icon class="text-2xl">
                notifications
              </mat-icon>
            </div>
          </a>
        </template>
      </mat-tooltip>
    </div>

    <template v-if="pluginPages.length">
      <mat-divider />

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
  </aside>
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

<style scoped>
/* tooltip 的触发器为 display:contents， flattened 后的 .navi-btn 成为 flex item，
   间距统一交给容器 gap 而不是相邻选择器 */
.navi-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.navi-panel :deep(.navi-btn) {
  height: 56px;
}

.navi-btn {
  cursor: default;
}

/* hover 形变走纯 CSS（NaviLink 同款规则），不经过 Vue 响应式 */
.navi-avatar {
  color: var(--mat-sys-color-on-secondary-container);
  background-color: var(--mat-sys-color-secondary-container);
  transition:
    border-radius .25s cubic-bezier(.4, 0, .2, 1),
    background-color .25s cubic-bezier(.4, 0, .2, 1),
    color .25s cubic-bezier(.4, 0, .2, 1);
}

.navi-avatar--round {
  border-radius: var(--mat-sys-shape-corner-full);
}

.navi-avatar--active,
.navi-btn:hover .navi-avatar--round {
  /* 24px：28px（extra-large）在 56px 图标上恰为正圆会失去形变，24 是可见形变的上限 */
  border-radius: 24px;
  background-color: var(--mat-sys-color-primary-container);
  color: var(--mat-sys-color-on-primary-container);
}
</style>
