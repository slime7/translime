<template>
  <v-hover
    v-slot="{ hover }"
  >
    <v-card
      class="plugin-item-card ease-animation fill-height"
      :elevation="hover ? 10 : 2"
      :disabled="disabled"
    >
      <div class="d-flex flex-no-wrap justify-space-between">
        <div>
          <v-card-title
            class="text-h5"
            v-text="cardTitle"
          />

          <v-card-subtitle>
            <span v-if="!plugin.link">{{ cardSubTitle }}</span>
            <a v-else @click="authLink">{{ cardSubTitle }}</a>
          </v-card-subtitle>

          <v-card-text v-text="plugin.description" />

          <v-card-actions>
            <v-btn
              v-if="!plugin.enabled"
              class="ml-2"
              fab
              icon
              height="40px"
              width="40px"
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
              @click="uninstall"
            >
              <v-icon>delete</v-icon>
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
          </v-card-actions>
        </div>

        <v-avatar
          class="ma-3"
          size="125"
          tile
        >
          <v-img v-if="plugin.icon" :src="plugin.icon" />
          <v-img v-else :src="defaultIcon" />
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
import { toRefs, computed } from '@vue/composition-api';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import defaultIcon from '../../assets/plugin-default-image.png';
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

  setup(props, { emit }) {
    const { plugin } = toRefs(props);
    const pluginId = plugin.value.packageName;
    const ipc = useIpc();

    const cardTitle = computed(() => (plugin.value.author ? `${plugin.value.title}@${plugin.value.version}` : plugin.value.title));
    const cardSubTitle = computed(() => (plugin.value.author ? plugin.value.author : plugin.value.version));
    const authLink = () => {
      ipc.send(ipcType.OPEN_LINK, { url: String(plugin.value.link) });
    };

    // 设置面板
    const { settingPanelVisible } = usePluginSettingPanel(pluginId);

    // 插件操作
    const {
      enable,
      disable,
      uninstall,
      showContextMenu,
    } = usePluginActions(plugin.value, emit);

    return {
      defaultIcon,
      settingPanelVisible,
      enable,
      disable,
      uninstall,
      showContextMenu,
      cardTitle,
      cardSubTitle,
      authLink,
    };
  },
};
</script>
