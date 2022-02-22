const id = 'translime-plugin-example';

// 加载时执行
export const pluginDidLoad = () => {
  console.log('plugin loaded');
  const setting = global.store.get(`plugin.${id}.settings`, {});
  console.log('settings: ', setting);
};

// 禁用时执行
export const pluginWillUnload = () => {
  console.log('plugin unloaded');
};

// 插件设置表单
export const settingMenu = [
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
];

// 插件上下文菜单
// https://www.electronjs.org/zh/docs/latest/api/menu-item
export const pluginMenu = [
  {
    id: `${id}-custom-menu`,
    label: 'custom menu',
    click() {
      console.log('custom menu clicked');
    },
  },
];
