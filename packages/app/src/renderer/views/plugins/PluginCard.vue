<template>
  <v-hover
    v-slot="{ isHovering, props }"
  >
    <v-card
      class="plugin-item-card ease-animation h-full overflow-hidden"
      v-bind="props"
      :elevation="isHovering ? 5 : 2"
      :disabled="disabled"
      rounded="xl"
      color="tertiary-container"
    >
      <div class="relative h-full">
        <div class="min-w-0 relative z-10 flex flex-col h-full">
          <v-tooltip :text="cardTitle" location="top">
            <template #activator="{ props: titleProps }">
              <v-card-title
                class="text-2xl"
                v-bind="titleProps"
              >
                <v-chip
                  v-if="plugin.dev"
                  size="small"
                  label
                  class="mr-2"
                >
                  本地开发
                </v-chip>
                <v-chip
                  v-if="statusMeta"
                  size="small"
                  label
                  class="mr-2"
                  :color="statusMeta.color"
                >
                  {{ statusMeta.label }}
                </v-chip>
                <span>{{ cardTitle }}</span>
              </v-card-title>
            </template>
          </v-tooltip>

          <v-card-subtitle>
            <span v-if="!plugin.link">{{ cardSubTitle }}</span>
            <a v-else @click="authLink">{{ cardSubTitle }}</a>
          </v-card-subtitle>

          <v-card-text class="grow">
            <div>{{ plugin.description }}</div>
            <div
              v-if="plugin.statusText"
              class="mt-2 text-sm plugin-status"
            >
              {{ plugin.statusText }}
            </div>
          </v-card-text>

          <v-card-actions>
            <template v-if="!plugin.searchResultItem">
              <v-btn
                v-if="!plugin.enabled"
                class="ml-2"
                fab
                icon
                height="40px"
                width="40px"
                title="启用"
                @click="enable"
              >
                <v-icon>play_arrow</v-icon>
              </v-btn>

              <v-btn
                v-else
                class="ml-2"
                fab
                icon
                height="40px"
                width="40px"
                title="禁用"
                @click="disable"
              >
                <v-icon>pause</v-icon>
              </v-btn>

              <v-btn
                class="ml-2"
                fab
                icon
                height="40px"
                width="40px"
                title="卸载"
                @click="uninstall"
              >
                <v-icon>delete</v-icon>
              </v-btn>

              <v-btn
                v-if="hasNewVersion"
                class="ml-2"
                fab
                icon
                height="40px"
                width="40px"
                color="success"
                title="升级"
                @click="install(versionList[1]?.value)"
              >
                <v-icon>deployed_code_update</v-icon>
              </v-btn>

              <v-btn
                class="ml-2"
                fab
                icon
                height="40px"
                width="40px"
                @click="showContextMenu"
              >
                <v-icon>settings</v-icon>
              </v-btn>
            </template>
            <template v-else>
              <v-btn
                class="ml-2"
                variant="elevated"
                color="primary"
                @click="install(selectedVersion)"
                v-if="!isInstalled"
              >
                安装
              </v-btn>

              <v-btn
                class="ml-2"
                variant="elevated"
                color="success"
                @click="install(selectedVersion)"
                v-if="canUpdated"
              >
                升级
              </v-btn>

              <v-btn
                class="ml-2"
                variant="elevated"
                @click="install(selectedVersion)"
                v-if="isInstalled && !canUpdated"
              >
                重新安装
              </v-btn>

              <v-select
                v-model="selectedVersion"
                class="version-selector ml-2"
                :items="versionList"
                label="版本"
                variant="outlined"
                hide-details
                density="compact"
                color="primary"
              />
            </template>
          </v-card-actions>
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
    </v-card>
  </v-hover>
</template>

<script>
import { storeToRefs } from 'pinia';
import {
  computed,
  ref,
  toRefs,
  watch,
} from 'vue';
import verCompare from 'semver-compare';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useGlobalStore from '@/store/globalStore';
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
    const ipc = useIpc();
    const store = useGlobalStore();

    const { plugins } = storeToRefs(store);
    const isInstalled = computed(() => plugins.value.some((p) => p.packageName === plugin.value.packageName));
    const canUpdated = computed(() => {
      if (!isInstalled.value) {
        return false;
      }
      const installedPlugin = plugins.value.find((p) => p.packageName === plugin.value.packageName);
      return verCompare(plugin.value.version, installedPlugin.version) > 0;
    });
    const cardTitle = computed(() => plugin.value.title);
    const cardSubTitle = computed(() => `${plugin.value.author ? `${plugin.value.author} · ` : ''}${plugin.value.version}`);
    const authLink = () => {
      ipc.send(ipcType.OPEN_LINK, { url: String(plugin.value.link) });
    };

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
    const selectedVersion = ref('');
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
          color: 'warning',
        };
      }
      if (plugin.value.status === 'build-missing') {
        return {
          label: '需要构建',
          color: 'warning',
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
          color: 'info',
        };
      }
      return null;
    });
    watch([isInstalled, canUpdated], () => {
      selectedVersion.value = '';
    });

    expose({
      showSettingPanel,
      pluginId,
    });

    return {
      settingPanelVisible,
      install,
      enable,
      disable,
      uninstall,
      showContextMenu,
      cardTitle,
      cardSubTitle,
      authLink,
      isInstalled,
      canUpdated,
      selectedVersion,
      versionList,
      hasNewVersion,
      statusMeta,
    };
  },
};
</script>

<style scoped>
.version-selector {
  max-width: 135px;
}

.plugin-item-card {
  position: relative;
  transition: all .3s cubic-bezier(.4, 0, .2, 1);

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
