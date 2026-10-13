// ESM 版 mock 插件主进程入口（与 translime-plugin-mock-test 行为对齐）。
// ENTRY_VERSION 供热重载 e2e 断言：入口产物变化并被宿主重新加载后，
// test-ipc 的返回值会携带新版本号，直接证明 ESM 模块被重新求值。
const id = 'translime-plugin-dev-e2e';

const ENTRY_VERSION = 'v1';

const pluginDidLoad = () => {
  console.log("plugin loaded");
  const setting = global.mainStore?.config?.get(`plugin.${id}.settings.setting`, {});
  console.log("settings: ", setting);
};

const pluginWillUnload = () => {
  console.log("plugin unloaded");
};

const pluginSettingSaved = () => {
  console.log("plugin setting saved");
};

const settingMenu = [
  {
    key: 'input-1',
    type: 'input',
    name: '文本1',
    required: false,
    placeholder: '输入提示',
  },
  {
    type: 'password',
    name: '密码',
    required: true,
    placeholder: '请输入密码',
  },
  {
    type: 'switch',
    name: '开关',
  },
];

const pluginMenu = [
  {
    id: `${id}-custom-menu`,
    label: 'custom menu',
    click() {
      console.log("custom menu clicked");
    },
  },
];

const ipcHandlers = [
  {
    type: 'test-ipc',
    handler: ({ sendToClient }) => (arg1, arg2) => {
      console.log("test-ipc", "test ipc from plugin: ", arg1, arg2);
      sendToClient(`test-ipc-reply@${id}`, `test ipc reply from plugin (${ENTRY_VERSION})`);
      return { success: true, message: '响应结果', version: ENTRY_VERSION };
    },
  },
];

const commands = [
  {
    id: 'translime-plugin-mock-test-esm.increment-counter',
    handler() {
      return ENTRY_VERSION;
    },
  },
];

export default {
  pluginDidLoad,
  pluginWillUnload,
  pluginSettingSaved,
  settingMenu,
  pluginMenu,
  ipcHandlers,
  commands,
};
