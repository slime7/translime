<template>
  <mat-hover
    v-slot="{ isHovering, props }"
  >
    <mat-card
      class="plugin-item-card ease-animation h-full overflow-hidden rounded-3xl"
      data-test="plugin-card"
      :data-test-package="plugin.packageName"
      variant="elevated"
      color="tertiary-container"
      :class="isHovering ? 'shadow-[var(--mat-sys-elevation-level3)]' : 'shadow-[var(--mat-sys-elevation-level1)]'"
      v-bind="props"
    >
      <div class="relative h-full">
        <div class="min-w-0 relative z-10 flex flex-col h-full">
          <mat-tooltip :content="cardTitle" location="top">
            <template #activator>
              <div class="flex items-center px-4 pt-4 text-mat-title-large">
                <mat-chip
                  v-if="plugin.dev"
                  class="mr-2"
                >
                  本地开发
                </mat-chip>
                <mat-chip
                  v-if="statusMeta"
                  class="mr-2"
                  :color="statusMeta.color"
                >
                  {{ statusMeta.label }}
                </mat-chip>
                <span>{{ cardTitle }}</span>
              </div>
            </template>
          </mat-tooltip>

          <div class="px-4 pt-1 text-mat-body-medium opacity-80">
            <span>{{ cardSubTitle }}</span>
          </div>

          <mat-card-content class="grow">
            <div>{{ plugin.description }}</div>
            <div
              v-if="plugin.statusText"
              class="mt-2 text-mat-body-medium plugin-status"
            >
              {{ plugin.statusText }}
            </div>
          </mat-card-content>

          <mat-card-actions>
            <mat-btn
              v-if="canOpen"
              class="ml-2"
              icon="open_in_new"
              label="打开"
              data-test="plugin-open-btn"
              :disabled="disabled"
              @click="openPlugin"
            />

            <mat-btn
              v-if="!plugin.enabled"
              class="ml-2"
              icon="play_arrow"
              label="启用"
              data-test="plugin-enable-btn"
              :disabled="disabled"
              @click="enable"
            />

            <mat-btn
              v-else
              class="ml-2"
              icon="pause"
              label="禁用"
              data-test="plugin-disable-btn"
              :disabled="disabled"
              @click="disable"
            />

            <mat-btn
              v-if="hasNewVersion"
              class="ml-2"
              icon="deployed_code_update"
              label="升级"
              :color="STATUS_SUCCESS"
              :disabled="disabled"
              @click="install(versionList[1]?.value)"
            />

            <mat-btn
              class="ml-2"
              icon="settings"
              label="设置"
              :disabled="disabled"
              @click="showContextMenu"
            />

            <mat-btn
              class="ml-2 pin-btn"
              :class="{ 'pin-btn--pinned': isPinned }"
              :variant="isPinned ? 'filled-tonal' : 'filled'"
              icon="push_pin"
              :label="isPinned ? '取消固定到侧栏' : '固定到侧栏'"
              :aria-label="isPinned ? '取消固定到侧栏' : '固定到侧栏'"
              data-test="plugin-pin-btn"
              @click="togglePin"
            />

            <mat-btn
              class="ml-2"
              icon="delete"
              label="卸载"
              data-test="plugin-uninstall-btn"
              :disabled="disabled"
              @click="uninstall"
            />
          </mat-card-actions>
        </div>

        <img
          v-if="plugin.icon"
          class="plugin-bg-icon"
          :src="plugin.icon"
        >
      </div>

      <plugin-setting-panel
        v-model="settingPanelVisible"
        :plugin="plugin"
      />
    </mat-card>
  </mat-hover>
</template>

<script>
import {
  computed,
  toRefs,
} from 'vue';
import { useRouter } from 'vue-router';
import verCompare from 'semver-compare';
import useGlobalStore from '@/store/globalStore';
import { openPluginWindow } from '@/utils';
import { STATUS_INFO, STATUS_SUCCESS, STATUS_WARNING } from '@/utils/statusColors';
import PluginSettingPanel from './PluginSettingPanel.vue';
import usePluginSettingPanel from './hooks/usePluginSettingPanel';
import usePluginActions from './hooks/usePluginActions';

export default {
  name: 'PluginCard',

  components: {
    PluginSettingPanel,
  },

  props: {
    plugin: {
      type: Object,
      required: true,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },

  emits: ['install', 'uninstall', 'disable', 'enable'],

  setup(props, { emit, expose }) {
    const { plugin } = toRefs(props);
    const pluginId = plugin.value.packageName;
    const store = useGlobalStore();
    const router = useRouter();

    const canOpen = computed(() => plugin.value.enabled && !!(plugin.value.ui || plugin.value.windowUrl));
    const openPlugin = () => {
      if (plugin.value.windowMode) {
        openPluginWindow(plugin.value);
        return;
      }

      router.push({ name: 'PluginPage', params: { packageName: plugin.value.packageName } });
    };
    const isPinned = computed(() => store.appSetting?.pinnedPlugins?.includes(pluginId));
    const togglePin = async () => {
      await store.togglePinPlugin(pluginId);
    };

    const cardTitle = computed(() => plugin.value.title);
    const cardSubTitle = computed(() => `${plugin.value.author ? `${plugin.value.author} · ` : ''}${plugin.value.version}`);

    // 设置面板
    const { settingPanelVisible, showSettingPanel } = usePluginSettingPanel(pluginId);

    // 插件操作
    const {
      install,
      enable,
      disable,
      uninstall,
      showContextMenu,
    } = usePluginActions(plugin.value, emit);

    // 面板版本选择
    const versionList = computed(() => [
      {
        value: '',
        title: '@latest',
      },
      ...(plugin.value.versions ?? []),
    ]);
    const hasNewVersion = computed(() => versionList.value.length > 1 && verCompare(versionList.value[1].value, plugin.value.version) > 0);
    const statusMeta = computed(() => {
      if (plugin.value.status === 'blocked') {
        return {
          label: '依赖阻塞',
          color: STATUS_WARNING,
        };
      }
      if (plugin.value.status === 'build-missing') {
        return {
          label: '需要构建',
          color: STATUS_WARNING,
        };
      }
      if (plugin.value.status === 'load-error') {
        return {
          label: '加载失败',
          color: 'error',
        };
      }
      if (plugin.value.dependents?.length) {
        return {
          label: '被依赖',
          color: STATUS_INFO,
        };
      }
      return null;
    });
    expose({
      showSettingPanel,
      pluginId,
    });

    return {
      STATUS_SUCCESS,
      settingPanelVisible,
      install,
      enable,
      disable,
      uninstall,
      showContextMenu,
      cardTitle,
      cardSubTitle,
      canOpen,
      openPlugin,
      isPinned,
      togglePin,
      versionList,
      hasNewVersion,
      statusMeta,
    };
  },
};
</script>

<style scoped>
/* 固定时图钉图标切换 FILL 轴：轮廓（未固定）→ 实心（已固定） */
.pin-btn--pinned :deep(.mat-btn__icon) {
  font-variation-settings: 'FILL' 1;
}

.plugin-item-card {
  position: relative;
  transition: all .3s cubic-bezier(.4, 0, .2, 1);

  /* 卡片底色是语义容器色，chip 默认的 surface 角色文字（on-surface-variant）在容器色上对比度不足，
     改为跟随容器色角色；带显式 color 的状态 chip 填充其容器色，保证状态可辨识 */
  :deep(.mat-chip) {
    --mat-chip-label-color: var(--mat-on-accent-container-color);
    --mat-chip-icon-color: var(--mat-on-accent-container-color);
    --mat-chip-outline-color: color-mix(in srgb, var(--mat-on-accent-container-color) 40%, transparent);
  }

  :deep(.mat-chip--explicit-color) {
    --mat-chip-container-color: var(--mat-accent-container-color);
    --mat-chip-outline-color: transparent;
  }

  .plugin-status {
    opacity: .78;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .plugin-bg-icon {
    position: absolute;
    display: block;
    right: -28px;
    bottom: -28px;
    width: 240px;
    height: 240px;
    border-radius: 108px;
    opacity: .12;
    transform: rotate(-45deg);
    pointer-events: none;
    z-index: 0;
    transition: all .4s ease-in-out;
    filter: grayscale(.2);
    mask-image: radial-gradient(closest-side, black 0%, transparent 75%);
  }

  &:hover {
    .plugin-bg-icon {
      transform: rotate(-45deg) scale(1.15);
      opacity: .3;
    }
  }
}

</style>
