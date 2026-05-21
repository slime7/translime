import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PluginSettingPanel from '@/views/plugins/PluginSettingPanel.vue';

const { ipcMock, selectFileDialogMock, toastMock } = vi.hoisted(() => ({
  ipcMock: {
    invoke: vi.fn(),
  },
  selectFileDialogMock: vi.fn(),
  toastMock: {
    show: vi.fn(),
  },
}));

vi.mock('@/hooks/electron', () => ({
  useIpc: () => ipcMock,
}));

vi.mock('@/hooks/useToast', () => ({
  default: () => toastMock,
}));

vi.mock('@/utils', () => ({
  selectFileDialog: selectFileDialogMock,
  showTextEditContextMenu: vi.fn(),
}));

vi.mock('@pkg/share/utils/ipcConstant', () => ({
  GET_PLUGIN_SETTING: 'get-plugin-setting',
  SET_PLUGIN_SETTING: 'set-plugin-setting',
}));

const basePlugin = {
  packageName: 'translime-plugin-test',
  settingMenu: [
    {
      key: 'filePath',
      type: 'file',
      name: 'File Path',
      required: true,
      dialogOptions: {
        properties: ['openFile', 'dontAddToRecent'],
      },
    },
  ],
};

const globalMountOptions = {
  global: {
    stubs: {
      'v-dialog': {
        template: '<div class="v-dialog-stub"><slot /></div>',
        props: ['modelValue'],
      },
      'v-card': { template: '<div><slot /></div>' },
      'v-toolbar': { template: '<div><slot /></div>' },
      'v-btn': {
        template: '<button @click="$emit(\'click\')"><slot /></button>',
      },
      'v-icon': { template: '<span><slot /></span>' },
      'v-toolbar-title': { template: '<div><slot /></div>' },
      'v-spacer': true,
      'v-toolbar-items': { template: '<div><slot /></div>' },
      'v-card-text': { template: '<div><slot /></div>' },
      'v-form': {
        template: '<form><slot /></form>',
        methods: {
          validate: () => true,
        },
      },
      'v-container': { template: '<div><slot /></div>' },
      'v-tooltip': {
        template: '<div class="tooltip" :data-text="text"><slot name="activator" :props="{}" /></div>',
        props: ['text'],
      },
      'v-text-field': {
        template: '<button class="text-field" :data-label="label" :data-value="modelValue || value || \'\'" @click="$emit(\'click:control\')">{{ modelValue || value || "" }}</button>',
        props: [
          'modelValue',
          'value',
          'label',
          'placeholder',
          'rules',
          'required',
          'readonly',
        ],
      },
      'v-select': true,
      'v-switch': true,
      'v-checkbox': true,
      'v-radio-group': true,
      'v-radio': true,
      'v-progress-circular': true,
    },
  },
};

const mountPanel = async (settings = {}, plugin = basePlugin) => {
  ipcMock.invoke.mockResolvedValue(settings);
  const wrapper = mount(PluginSettingPanel, {
    props: {
      modelValue: false,
      plugin,
    },
    ...globalMountOptions,
  });

  await wrapper.setProps({ modelValue: true });
  await flushPromises();
  return wrapper;
};

describe('PluginSettingPanel.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectFileDialogMock.mockResolvedValue({ canceled: true, filePaths: [] });
  });

  it('opens the file dialog with item dialog options', async () => {
    const wrapper = await mountPanel();
    selectFileDialogMock.mockResolvedValue({
      canceled: false,
      filePaths: ['C:\\tools\\ffmpeg.exe'],
    });

    await wrapper.find('.text-field').trigger('click');
    await flushPromises();

    expect(selectFileDialogMock).toHaveBeenCalledWith('app', {
      properties: ['openFile', 'dontAddToRecent'],
    });
  });

  it('stores selected file paths as an array', async () => {
    const wrapper = await mountPanel();
    selectFileDialogMock.mockResolvedValue({
      canceled: false,
      filePaths: ['C:\\tools\\ffmpeg.exe'],
    });

    await wrapper.find('.text-field').trigger('click');
    await flushPromises();

    expect(wrapper.vm.settings.filePath).toEqual(['C:\\tools\\ffmpeg.exe']);
  });

  it('stores selected file paths as a string when valueType is string', async () => {
    const plugin = {
      ...basePlugin,
      settingMenu: [
        {
          ...basePlugin.settingMenu[0],
          valueType: 'string',
        },
      ],
    };
    const wrapper = await mountPanel({}, plugin);
    selectFileDialogMock.mockResolvedValue({
      canceled: false,
      filePaths: ['C:\\Steam'],
    });

    await wrapper.find('.text-field').trigger('click');
    await flushPromises();

    expect(wrapper.vm.settings.filePath).toBe('C:\\Steam');
  });

  it('keeps the previous value when file selection is canceled', async () => {
    const wrapper = await mountPanel({ filePath: ['C:\\tools\\old.exe'] });
    selectFileDialogMock.mockResolvedValue({
      canceled: true,
      filePaths: ['C:\\tools\\new.exe'],
    });

    await wrapper.find('.text-field').trigger('click');
    await flushPromises();

    expect(wrapper.vm.settings.filePath).toEqual(['C:\\tools\\old.exe']);
  });

  it('normalizes saved string file paths for display', async () => {
    const wrapper = await mountPanel({ filePath: 'C:\\tools\\ffmpeg.exe' });

    expect(wrapper.vm.settings.filePath).toEqual(['C:\\tools\\ffmpeg.exe']);
    expect(wrapper.find('.text-field').attributes('data-value')).toBe('C:\\tools\\ffmpeg.exe');
  });

  it('normalizes saved array file paths to a string when valueType is string', async () => {
    const plugin = {
      ...basePlugin,
      settingMenu: [
        {
          ...basePlugin.settingMenu[0],
          valueType: 'string',
        },
      ],
    };
    const wrapper = await mountPanel({ filePath: ['C:\\Steam'] }, plugin);

    expect(wrapper.vm.settings.filePath).toBe('C:\\Steam');
    expect(wrapper.find('.text-field').attributes('data-value')).toBe('C:\\Steam');
  });

  it('validates required array values', async () => {
    const wrapper = await mountPanel();
    const validateRequired = wrapper.vm.requiredRule[0];

    expect(validateRequired([])).toBe('此项必填');
    expect(validateRequired(['C:\\tools\\ffmpeg.exe'])).toBe(true);
  });
});
