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
            variant="text"
            @click="saveSettings"
          >
            保存
          </v-btn>
        </v-toolbar-items>
      </v-toolbar>

      <v-card-text>
        <div class="mt-4">有些设置可能需要重启插件生效</div>

        <v-form v-if="!loading.getSettings" class="mt-4" ref="settingForm">
          <v-container fluid>
            <v-row
              v-for="(menuItem, index) in settingMenu"
              :key="index"
              align="center"
            >
              <v-text-field
                v-if="menuItem.type === 'input' || menuItem.type === 'password'"
                v-model="settings[menuItem.key]"
                class="mt-2"
                :label="menuItem.name"
                :type="menuItem.type || 'input'"
                :placeholder="menuItem.placeholder"
                :rules="menuItem.required ? requiredRule : []"
                :required="menuItem.required"
                variant="outlined"
                @click.right="showTextEditContextMenu"
              />

              <v-tooltip
                v-if="menuItem.type === 'file'"
                :text="settings[menuItem.key] && settings[menuItem.key].length ? settings[menuItem.key].join(',') : '未选择'"
                location="bottom"
              >
                <template v-slot:activator="{ props }">
                  <v-text-field
                    v-bind="props"
                    :model-value="settings[menuItem.key] && settings[menuItem.key].length ? settings[menuItem.key].join(',') : ''"
                    class="mt-2"
                    :label="menuItem.name"
                    :placeholder="menuItem.placeholder"
                    :rules="menuItem.required ? requiredRule : []"
                    :required="menuItem.required"
                    variant="outlined"
                    readonly
                    @click:control="selectFile.open(menuItem)"
                  />
                </template>
              </v-tooltip>

              <v-select
                v-if="menuItem.type === 'list'"
                v-model="settings[menuItem.key]"
                class="mt-2"
                :items="menuItem.choices"
                :label="menuItem.name"
                item-title="name"
                :rules="menuItem.required ? requiredRule : []"
                :required="menuItem.required"
                variant="outlined"
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
                  class="flex-grow-0 flex-shrink-0"
                  :id="`switch-${menuItem.key}`"
                  color="primary"
                  hide-details
                />
              </template>

              <template
                v-if="menuItem.type === 'checkbox'"
              >
                <label class="mr-2" v-text="menuItem.name" />
                <v-checkbox
                  v-model="settings[menuItem.key]"
                  v-for="(menuCheckboxItem, index) in menuItem.choices"
                  :key="index"
                  :label="menuCheckboxItem.name"
                  :value="menuCheckboxItem.value"
                  class="mr-2 flex-grow-0"
                  color="primary"
                  hide-details
                />
              </template>

              <template v-if="menuItem.type === 'radio'">
                <label class="mr-2" v-text="menuItem.name" />

                <v-radio-group
                  v-if="menuItem.type === 'radio'"
                  v-model="settings[menuItem.key]"
                  mandatory
                  inline
                  hide-details
                >
                  <v-radio
                    v-for="(menuRadioItem, index) in menuItem.choices"
                    :key="index"
                    :label="menuRadioItem.name"
                    :value="menuRadioItem.value"
                    color="primary"
                  />
                </v-radio-group>
              </template>
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
import {
  ref,
  computed,
  reactive,
  onMounted,
  toRaw,
} from 'vue';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useToast from '@/hooks/useToast';
import { showTextEditContextMenu, selectFileDialog } from '@/utils';

export default {
  name: 'PluginSettingPanel',

  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
    plugin: {
      type: Object,
      required: true,
    },
  },

  setup(props, { emit }) {
    const ipc = useIpc();
    const toast = useToast();

    const internalValue = computed({
      get() {
        return props.modelValue;
      },
      set(value) {
        emit('update:modelValue', value);
      },
    });
    const requiredRule = [(v) => !!v || '此项必填'];

    const loading = reactive({
      getSettings: false,
      setSettings: false,
    });
    const settings = reactive({});
    const initSettings = async () => {
      const { packageName } = props.plugin;
      loading.getSettings = true;
      const settingsSaved = await ipc.invoke(ipcType.GET_PLUGIN_SETTING, packageName);
      if (typeof settingsSaved === 'object') {
        Object.keys(settingsSaved).forEach((key) => {
          settings[key] = settingsSaved[key];
        });
      }
      loading.getSettings = false;
    };
    onMounted(() => {
      initSettings();
    });
    const parseMenuItem = (settingMenu) => {
      const parsedSettingMenu = [];
      settingMenu.forEach((menu) => {
        let parsed;
        switch (menu.type) {
          case 'input':
          case 'password':
          case 'switch':
          case 'file':
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
        if (!settings[parsed.key]) {
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
          settings[parsed.key] = defaultValue;
        }
      });
      return parsedSettingMenu;
    };
    const settingMenu = computed(() => (props.plugin.settingMenu ? parseMenuItem(props.plugin.settingMenu) : []));

    const settingForm = ref(null);
    const saveSettings = async () => {
      if (loading.setSettings) {
        return;
      }
      const isValid = settingForm.value.validate();
      if (!isValid) {
        return;
      }
      const { packageName } = props.plugin;
      loading.setSettings = true;
      await ipc.invoke(ipcType.SET_PLUGIN_SETTING, packageName, toRaw(settings));
      loading.setSettings = false;
      toast.show('设置已保存');
    };

    const useSelectFile = () => {
      const isOpen = ref(false);
      const filePath = ref([]);
      const error = ref('');
      const open = async (menuItem) => {
        if (isOpen.value) {
          return;
        }

        isOpen.value = true;
        const result = await selectFileDialog('app', toRaw(menuItem.dialogOptions));
        isOpen.value = false;
        if (result.err) {
          error.value = '读取文件出错';
        } else if (!result.data.canceled) {
          /**
           * 数组
           * @type {string[]}
           */
          filePath.value = result.data.filePaths;
          settings[menuItem.key] = filePath.value;
        }
      };

      return {
        isOpen,
        filePath,
        open,
      };
    };
    const selectFile = useSelectFile();

    return {
      internalValue,
      requiredRule,
      settingMenu,
      settingForm,
      loading,
      settings,
      saveSettings,
      showTextEditContextMenu,
      selectFile,
    };
  },
};
</script>
