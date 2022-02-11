<template>
  <v-hover
    v-slot="{ hover }"
  >
    <v-card
      class="plugin-item-card ease-animation"
      :elevation="hover ? 10 : 2"
    >
      <div class="d-flex flex-no-wrap justify-space-between">
        <div>
          <v-card-title
            class="text-h5"
            v-text="plugin.title"
          />

          <v-card-subtitle v-text="plugin.version" />

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
              @click="uninstallConfirm"
            >
              <v-icon>delete</v-icon>
            </v-btn>

            <v-btn
              v-if="plugin.settingMenu && plugin.settingMenu.length"
              class="ml-2"
              fab
              icon
              height="40px"
              width="40px"
              @click="showSettingPanel"
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
import mixins from '@/mixins';
import defaultIcon from '../../assets/plugin-default-image.png';
import PluginSettingPanel from './PluginSettingPanel.vue';

export default {
  name: 'PluginCard',

  components: {
    PluginSettingPanel,
  },

  mixins: [mixins],

  props: {
    plugin: {
      type: Object,
      required: true,
    },
  },

  data: () => ({
    defaultIcon,
    uninstallConfirmVisible: false,
    settingPanelVisible: false,
  }),

  methods: {
    async uninstallConfirm() {
      const confirmResult = await this.confirm(`确定要卸载插件”${this.plugin.title}“吗？`, '卸载确认');
      if (confirmResult.confirm) {
        this.uninstall();
      }
    },
    uninstall() {
      this.$emit('uninstall', this.plugin.packageName);
    },
    disable() {
      this.$emit('disable', this.plugin.packageName);
    },
    enable() {
      this.$emit('enable', this.plugin.packageName);
    },
    showSettingPanel() {
      this.settingPanelVisible = true;
    },
  },
};
</script>
