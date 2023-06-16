const id = 'translime-plugin-example';

// 加载时执行
const pluginDidLoad = () => {
  console.log('plugin loaded');
  const setting = global.store.get(`plugin.${id}.settings`, {});
  console.log('settings: ', setting);
};

// 禁用时执行
const pluginWillUnload = () => {
  console.log('plugin unloaded');
};

// 设置保存时执行
const pluginSettingSaved = () => {
  console.log('plugin setting saved');
};

// 插件设置表单
const settingMenu = [
  // 文本框
  {
    key: 'input-1', // 设置储存到配置文件的字段，没有这个字段则取 name 的值
    type: 'input', // 输入类型
    name: '文本1', // 输入显示的字段名
    required: false, // 是否必填
    placeholder: '输入提示',
  },
  // 密码文本框
  {
    type: 'password',
    name: '密码',
    required: true,
    placeholder: '请输入密码',
  },
  // 开关
  {
    type: 'switch',
    name: '开关',
  },
  // 复选框
  {
    type: 'checkbox',
    name: '复选',
    choices: [
      {
        name: '选择1',
        value: 'foo',
      },
      {
        name: '选择2',
        value: 'bar',
      },
      {
        name: '选择3', // 没有 value 则用 name 作为值
      },
    ],
  },
  // 单选框
  {
    type: 'radio',
    name: '单选',
    choices: ['foo', 'bar'], // 可以使用复选框的方式，也可直接用文本数组，默认选择第一个
  },
  // 下拉菜单
  {
    type: 'list',
    name: '下拉菜单',
    required: true,
    choices: ['foo', 'bar'],
  },
  // 文件选择
  {
    key: 'file-1',
    type: 'file',
    name: '文件选择1',
    required: false, // 是否必填
    placeholder: '输入提示',
    // 选项属性 https://www.electronjs.org/zh/docs/latest/api/dialog#dialogshowopendialogbrowserwindow-options
    dialogOptions: {
      filters: [
        { name: '图片', extensions: ['jpg', 'png', 'gif'] },
        { name: '视频', extensions: ['mkv', 'avi', 'mp4'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
    },
  },
];

// 插件上下文菜单
// https://www.electronjs.org/zh/docs/latest/api/menu-item
const pluginMenu = [
  {
    id: `${id}-custom-menu`,
    label: 'custom menu',
    click() {
      console.log('custom menu clicked');
    },
  },
];

// ipc 定义
const ipcHandlers = [
  {
    type: 'test-ipc', // 调用时需加上`@${id}`，此处为 'test-ipc@translime-plugin-example'
    handler: ({ sendToClient }) => (arg1, arg2) => {
      console.log('test-ipc', 'test ipc from plugin: ', arg1, arg2);
      sendToClient(`test-ipc-reply@${id}`, 'test ipc reply from plugin');
    },
  },
];

module.exports = {
  pluginDidLoad,
  pluginWillUnload,
  pluginSettingSaved,
  settingMenu,
  pluginMenu,
  ipcHandlers,
};
