<template>
  <mat-dialog
    v-model="internalValue"
    width="560"
    title="配置"
    data-test="plugin-setting-dialog"
  >
    <div class="mt-4">
      有些设置可能需要重启插件生效
    </div>

    <div v-if="!loading.getSettings" class="mt-4">
      <div
        v-for="(menuItem, index) in settingMenu"
        :key="index"
        class="flex items-center"
      >
        <mat-text-field
          v-if="menuItem.type === 'input' || menuItem.type === 'password'"
          v-model="settings[menuItem.key]"
          class="mt-2 w-full"
          :label="menuItem.name"
          :type="menuItem.type === 'password' ? 'password' : 'text'"
          :placeholder="menuItem.placeholder"
          :required="menuItem.required"
          :error="!!validationErrors[menuItem.key]"
          :error-text="validationErrors[menuItem.key]"
          color="primary"
          @contextmenu="showTextEditContextMenu"
        />

        <mat-tooltip
          v-if="menuItem.type === 'file'"
          :content="formatFilePaths(settings[menuItem.key]) || '未选择'"
          location="bottom"
        >
          <template #activator>
            <div
              class="mt-2 w-full"
              @click="selectFile.open(menuItem)"
            >
              <mat-text-field
                :model-value="formatFilePaths(settings[menuItem.key])"
                class="w-full"
                :label="menuItem.name"
                :placeholder="menuItem.placeholder"
                :required="menuItem.required"
                :error="!!validationErrors[menuItem.key]"
                :error-text="validationErrors[menuItem.key]"
                color="primary"
                readonly
              />
            </div>
          </template>
        </mat-tooltip>

        <mat-select
          v-if="menuItem.type === 'list'"
          v-model="settings[menuItem.key]"
          class="mt-2 w-full"
          :items="menuItem.choices"
          :label="menuItem.name"
          item-title="name"
          item-value="value"
          :required="menuItem.required"
          :error="!!validationErrors[menuItem.key]"
          :error-text="validationErrors[menuItem.key]"
          color="primary"
        />

        <template v-if="menuItem.type === 'switch'">
          <label
            v-text="menuItem.name"
            class="grow"
            :for="`switch-${menuItem.key}`"
          />

          <mat-switch
            v-model="settings[menuItem.key]"
            class="grow-0 shrink-0"
            :id="`switch-${menuItem.key}`"
            color="primary"
          />
        </template>

        <template v-if="menuItem.type === 'checkbox'">
          <label class="mr-2" v-text="menuItem.name" />
          <mat-checkbox
            v-model="settings[menuItem.key]"
            v-for="(menuCheckboxItem, cIndex) in menuItem.choices"
            :key="cIndex"
            :value="menuCheckboxItem.value"
            class="mr-2 grow-0"
            color="primary"
          >
            {{ menuCheckboxItem.name }}
          </mat-checkbox>
        </template>

        <template v-if="menuItem.type === 'radio'">
          <mat-radio-group
            v-model="settings[menuItem.key]"
            class="w-full"
            :label="menuItem.name"
            color="primary"
          >
            <mat-radio
              v-for="(menuRadioItem, rIndex) in menuItem.choices"
              :key="rIndex"
              :value="menuRadioItem.value"
            >
              {{ menuRadioItem.name }}
            </mat-radio>
          </mat-radio-group>
        </template>
      </div>
    </div>

    <div v-else class="flex justify-center">
      <mat-progress variant="circular" indeterminate />
    </div>

    <template #actions>
      <div class="grow" />

      <mat-btn
        variant="text"
        data-test="plugin-setting-close-btn"
        @click="internalValue = false"
      >
        关闭
      </mat-btn>

      <mat-btn
        variant="filled"
        color="primary"
        data-test="plugin-setting-save-btn"
        @click="saveSettings"
      >
        保存
      </mat-btn>
    </template>
  </mat-dialog>
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

    const loading = reactive({
      getSettings: false,
      setSettings: false,
    });
    const settings = reactive({});
    const validationErrors = reactive({});
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

    const validateSettings = () => {
      let isValid = true;
      settingMenu.value.forEach((menuItem) => {
        if (!menuItem.required) {
          delete validationErrors[menuItem.key];
          return;
        }
        const value = settings[menuItem.key];
        const hasValue = Array.isArray(value) ? value.length > 0 : value !== '' && value !== null && typeof value !== 'undefined';
        if (hasValue) {
          delete validationErrors[menuItem.key];
        } else {
          validationErrors[menuItem.key] = '此项必填';
          isValid = false;
        }
      });
      return isValid;
    };
    const saveSettings = async () => {
      if (loading.setSettings) {
        return;
      }
      const isValid = validateSettings();
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
      validationErrors,
      settingMenu,
      loading,
      settings,
      validateSettings,
      saveSettings,
      formatFilePaths,
      showTextEditContextMenu,
      selectFile,
    };
  },
};
</script>
