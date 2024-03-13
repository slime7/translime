<template>
  <v-hover
    v-slot:default="{ isHovering, props }"
  >
    <v-card
      class="plugin-item-card ease-animation fill-height"
      v-bind="props"
      :elevation="isHovering ? 10 : 2"
      :disabled="disabled"
      rounded="xl"
    >
      <div class="d-flex flex-no-wrap justify-space-between">
        <div class="min-w-0">
          <v-tooltip :text="cardTitle" location="top">
            <template v-slot:activator="{ props }">
              <v-card-title
                class="text-h5"
                v-bind="props"
              >
                <v-chip
                  v-if="plugin.dev"
                  size="small"
                  label
                >
                  DEV
                </v-chip>
                <span>{{ cardTitle }}</span>
              </v-card-title>
            </template>
          </v-tooltip>

          <v-card-subtitle>
            <span v-if="!plugin.link">{{ cardSubTitle }}</span>
            <a v-else @click="authLink">{{ cardSubTitle }}</a>
          </v-card-subtitle>

          <v-card-text>{{ plugin.description }}</v-card-text>

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
                @click="install()"
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
                :loading="getVersionLoading"
                @update:menu="getVersions"
              />
            </template>
          </v-card-actions>
        </div>

        <v-avatar
          class="ma-3"
          size="125"
          tile
          v-if="!plugin.searchResultItem && plugin.icon"
        >
          <v-img :src="plugin.icon" />
        </v-avatar>
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
  ref,
  reactive,
  toRefs,
  computed,
  watch,
} from 'vue';
import verCompare from 'semver-compare';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useGlobalStore from '@/store/globalStore';
import useAxios from '@/hooks/useAxios';
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
    const axios = useAxios();

    const { plugins } = storeToRefs(store);
    const isInstalled = computed(() => plugins.value.some((p) => p.packageName === plugin.value.packageName));
    const canUpdated = computed(() => {
      if (!isInstalled.value) {
        return false;
      }
      const installedPlugin = plugins.value.find((p) => p.packageName === plugin.value.packageName);
      return verCompare(plugin.value.version, installedPlugin.version) > 0;
    });
    const cardTitle = computed(() => (plugin.value.author ? `${plugin.value.title}@${plugin.value.version}` : plugin.value.title));
    const cardSubTitle = computed(() => (plugin.value.author ? plugin.value.author : plugin.value.version));
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
    const versionList = reactive([
      {
        value: '',
        title: '@latest',
      },
    ]);
    const hasNewVersion = computed(() => versionList.length > 1 && verCompare(versionList[1].value, plugin.value.version) > 0);
    const getVersionLoading = ref(false);
    const versionLoaded = ref(false);
    const getVersions = async () => {
      if (versionLoaded.value) {
        return;
      }
      if (getVersionLoading.value) {
        return;
      }
      getVersionLoading.value = true;
      try {
        const { data } = await axios(`https://registry.npmjs.com/${pluginId}`, {
          method: 'get',
          params: {
            x: Math.random(),
          },
        });
        versionLoaded.value = true;
        const versions = Object.keys(data.versions).map((version) => ({
          value: version,
          title: `@${version}`,
        })).reverse();
        versionList.push(...versions);
      } catch (err) {
        console.log(pluginId, err.message);
        // alert.show(err.message, 'error');
      } finally {
        getVersionLoading.value = false;
      }
    };
    watch([isInstalled, canUpdated], () => {
      selectedVersion.value = '';
    });

    expose({
      showSettingPanel,
      pluginId,
      getVersions,
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
      getVersionLoading,
      getVersions,
      hasNewVersion,
    };
  },
};
</script>

<style scoped lang="scss">
.min-w-0 {
  min-width: 0;
}

.version-selector {
  max-width: 135px;
}
</style>
