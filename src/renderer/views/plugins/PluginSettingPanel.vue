<template>
  <v-dialog
    v-model="internalValue"
    persistent
    scrollable
    max-width="560"
  >
    <v-card>
      <v-toolbar
        dark
        color="primary"
      >
        <v-btn
          icon
          dark
          @click="internalValue = false"
        >
          <v-icon>close</v-icon>
        </v-btn>
        <v-toolbar-title>配置</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-toolbar-items>
          <v-btn
            dark
            text
            @click="saveSettings"
          >
            保存
          </v-btn>
        </v-toolbar-items>
      </v-toolbar>

      <v-card-text>
        <v-form v-if="!loading.getSettings" class="mt-4" ref="plugin-setting">
          <v-container fluid>
            <v-row
              v-for="(menuItem, index) in settingMenu"
              :key="index"
              align="center"
            >
              <v-text-field
                v-if="menuItem.type === 'input' || menuItem.type === 'password'"
                v-model="settings[menuItem.key]"
                :label="menuItem.name"
                :type="menuItem.type || 'input'"
                :placeholder="menuItem.placeholder"
                :rules="menuItem.required ? requiredRule : []"
                :required="menuItem.required"
                outlined
              />

              <v-select
                v-if="menuItem.type === 'list'"
                v-model="settings[menuItem.key]"
                :items="menuItem.choices"
                :label="menuItem.name"
                item-text="name"
                :rules="menuItem.required ? requiredRule : []"
                :required="menuItem.required"
                outlined
              />

              <template
                v-if="menuItem.type === 'switch'"
              >
                <label
                  v-text="menuItem.name"
                  class="flex-grow-1"
                  :for="`switch-${menuItem.key}`"
                />
                <v-switch
                  v-model="settings[menuItem.key]"
                  :id="`switch-${menuItem.key}`"
                />
              </template>

              <template
                v-if="menuItem.type === 'checkbox'"
              >
                <div class="mr-2" v-text="menuItem.name" />
                <v-checkbox
                  v-model="settings[menuItem.key]"
                  v-for="(menuCheckboxItem, index) in menuItem.choices"
                  :key="index"
                  :label="menuCheckboxItem.name"
                  :value="menuCheckboxItem.value"
                  class="mr-2"
                />
              </template>

              <v-radio-group
                v-if="menuItem.type === 'radio'"
                v-model="settings[menuItem.key]"
                :label="menuItem.name"
                mandatory
                row
              >
                <v-radio
                  v-for="(menuRadioItem, index) in menuItem.choices"
                  :key="index"
                  :label="menuRadioItem.name"
                  :value="menuRadioItem.value"
                />
              </v-radio-group>
            </v-row>
          </v-container>
        </v-form>

        <div v-else class="d-flex justify-center">
          <v-progress-circular indeterminate />
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script>
import * as ipcType from '@pkg/share/utils/ipcConstant';
import mixins from '@/mixins';
import { useIpc } from '@/hooks/electron';

const ipc = useIpc();

export default {
  name: 'PluginSettingPanel',

  mixins: [mixins],

  props: {
    value: {
      type: Boolean,
      default: false,
    },
    plugin: {
      type: Object,
      required: true,
    },
  },

  data: () => ({
    loading: {
      getSettings: false,
      setSettings: false,
    },
    settings: {},
    requiredRule: [(v) => !!v || '此项必填'],
  }),

  computed: {
    internalValue: {
      get() {
        return this.value;
      },
      set(value) {
        this.$emit('input', value);
      },
    },
    settingMenu() {
      return this.plugin.settingMenu ? this.parseMenuItem(this.plugin.settingMenu) : [];
    },
  },

  methods: {
    init() {
      this.initSettings();
    },
    async initSettings() {
      const { packageName } = this.plugin;
      this.loading.getSettings = true;
      const settings = await ipc.invoke(ipcType.GET_PLUGIN_SETTING, packageName);
      if (typeof settings === 'object') {
        this.settings = settings;
      }
      this.loading.getSettings = false;
    },
    parseMenuItem(settingMenu) {
      const parsedSettingMenu = [];
      settingMenu.forEach((menu) => {
        let parsed;
        switch (menu.type) {
          case 'input':
          case 'password':
          case 'switch':
            parsed = {
              ...menu,
              name: menu.name || '',
              key: menu.key || menu.name,
            };
            break;
          case 'checkbox':
          case 'radio':
          case 'list':
            parsed = {
              ...menu,
              name: menu.name || '',
              key: menu.key || menu.name,
              choices: menu.choices.map((c) => {
                if (typeof c === 'string') {
                  return {
                    name: c,
                    value: c,
                  };
                }
                if (!c.value) {
                  return {
                    ...c,
                    value: c.name,
                  };
                }
                return c;
              }),
            };
            break;
          default:
            break;
        }
        parsedSettingMenu.push(parsed);
        if (!this.settings[parsed.key]) {
          let defaultValue = '';
          if (parsed.type === 'switch') {
            defaultValue = false;
          }
          if (parsed.type === 'checkbox') {
            defaultValue = [];
          }
          if (parsed.type === 'radio') {
            defaultValue = parsed.choices[0].value;
          }
          if (parsed.type === 'list') {
            defaultValue = null;
          }
          this.$set(this.settings, parsed.key, defaultValue);
        }
      });
      return parsedSettingMenu;
    },
    async saveSettings() {
      if (this.loading.setSettings) {
        return;
      }
      const isValid = this.$refs['plugin-setting'].validate();
      if (!isValid) {
        return;
      }
      const { packageName } = this.plugin;
      this.loading.setSettings = true;
      await ipc.invoke(ipcType.SET_PLUGIN_SETTING, packageName, this.settings);
      this.loading.setSettings = false;
      this.toast('设置已保存');
    },
  },

  mounted() {
    this.init();
  },
};
</script>
