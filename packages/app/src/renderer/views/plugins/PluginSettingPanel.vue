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
        <v-spacer />
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
        <div class="mt-4">
          有些设置可能需要重启插件生效
        </div>

        <v-form v-if="!loading.getSettings" class="mt-4" ref="settingForm">
          <v-container fluid>
            <div
              v-for="(menuItem, index) in settingMenu"
              :key="index"
              class="flex items-center -mx-4"
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
                color="primary"
                @click.right="showTextEditContextMenu"
              />

              <v-tooltip
                v-if="menuItem.type === 'file'"
                :text="formatFilePaths(settings[menuItem.key]) || '未选择'"
                location="bottom"
              >
                <template #activator="{ props }">
                  <v-text-field
                    v-bind="props"
                    :model-value="formatFilePaths(settings[menuItem.key])"
                    class="mt-2"
                    :label="menuItem.name"
                    :placeholder="menuItem.placeholder"
                    :rules="menuItem.required ? requiredRule : []"
                    :required="menuItem.required"
                    variant="outlined"
                    color="primary"
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
                color="primary"
              />

              <template
                v-if="menuItem.type === 'switch'"
              >
                <label
                  v-text="menuItem.name"
                  class="grow"
                  :for="`switch-${menuItem.key}`"
                />

                <v-switch
                  v-model="settings[menuItem.key]"
                  class="grow-0 shrink-0"
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
                  v-for="(menuCheckboxItem, cIndex) in menuItem.choices"
                  :key="cIndex"
                  :label="menuCheckboxItem.name"
                  :value="menuCheckboxItem.value"
                  class="mr-2 grow-0"
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
                    v-for="(menuRadioItem, rIndex) in menuItem.choices"
                    :key="rIndex"
                    :label="menuRadioItem.name"
                    :value="menuRadioItem.value"
                    color="primary"
                  />
                </v-radio-group>
              </template>
            </div>
          </v-container>
        </v-form>

        <div v-else class="flex justify-center">
          <v-progress-circular indeterminate />
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script>
import {
  computed,
  reactive,
  ref,
  toRaw,
  watch,
} from 'vue';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useToast from '@/hooks/useToast';
import { selectFileDialog, showTextEditContextMenu } from '@/utils';

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

  emits: ['update:modelValue'],

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
    const normalizeFilePaths = (value) => {
      if (Array.isArray(value)) {
        return value;
      }
      if (typeof value === 'string' && value) {
        return [value];
      }
      return [];
    };
    const formatFilePaths = (value) => normalizeFilePaths(value).join(',');
    const isFileValueArray = (menuItem) => menuItem.valueType !== 'string';
    const normalizeFileValue = (value, menuItem) => {
      const filePaths = normalizeFilePaths(value);
      if (isFileValueArray(menuItem)) {
        return filePaths;
      }
      return filePaths[0] || '';
    };
    const requiredRule = [(v) => {
      const hasValue = Array.isArray(v) ? v.length > 0 : !!v;
      return hasValue || '此项必填';
    }];

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
    watch(() => props.modelValue, (v) => {
      if (v) {
        initSettings();
      }
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
        if (typeof settings[parsed.key] === 'undefined') {
          let defaultValue = '';
          if (parsed.type === 'switch') {
            defaultValue = false;
          }
          if (parsed.type === 'file') {
            defaultValue = normalizeFileValue([], parsed);
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
        } else if (parsed.type === 'file') {
          settings[parsed.key] = normalizeFileValue(settings[parsed.key], parsed);
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
        try {
          const result = await selectFileDialog('app', toRaw(menuItem.dialogOptions));
          if (result.err) {
            error.value = '读取文件出错';
          } else if (!result.canceled) {
            filePath.value = normalizeFilePaths(result.filePaths);
            settings[menuItem.key] = normalizeFileValue(filePath.value, menuItem);
          }
        } catch (err) {
          error.value = '读取文件出错';
        } finally {
          isOpen.value = false;
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
      formatFilePaths,
      showTextEditContextMenu,
      selectFile,
    };
  },
};
</script>
