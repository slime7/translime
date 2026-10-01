import { useLogger, usePluginConfig, defineIpcHandlers } from 'translime-sdk';

const id = 'translime-plugin-example';
const baseLogger = useLogger();
const logger = baseLogger.child ? baseLogger.child({ plugin_id: id, context: 'Main' }) : baseLogger;

const pluginConfig = usePluginConfig(id);

// 加载时执行
const pluginDidLoad = () => {
  logger.info(`[${id}] plugin loaded`);
  const setting = pluginConfig.get('setting', {});
  logger.info(`[${id}] settings:`, setting);
};

// 禁用时执行
const pluginWillUnload = () => {
  logger.info(`[${id}] plugin unloaded`);
};

// 设置保存时执行
const pluginSettingSaved = () => {
  logger.info(`[${id}] plugin setting saved`);
};

// 插件设置表单：覆盖全部控件类型，可作设置面板的参照实现
const settingMenu = [
  // 文本框
  {
    key: 'input-1', // 设置储存到配置文件的字段，没有这个字段则取 name 的值
    type: 'input', // 输入类型
    name: '文本1', // 输入显示的字段名
    required: false, // 是否必填
    placeholder: '输入提示',
  },
  // 密码框
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
  // 单选框 / 下拉列表
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
  {
    key: 'file-1',
    type: 'file',
    name: '文件选择1',
    required: false, // 是否必填
    valueType: 'array', // 保存格式：'array' 返回全部选择结果，'string' 返回第一个选择结果
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

// 插件上下文菜单（宿主以渲染端 M3 菜单渲染，仅支持 id/label/click/type/checked/enabled/visible）
const pluginMenu = [
  {
    id: `${id}-custom-menu`,
    label: 'custom menu',
    click() {
      logger.info(`[${id}] custom menu clicked`);
    },
  },
];

// ipc 定义
// defineIpcHandlers 提供结构校验：type 不需要也不能带 `@插件ID` 后缀，
// 宿主注册通道时会自动追加；UI 端用 useIpc('插件ID') 调用时 SDK 也会自动补全
const ipcHandlers = defineIpcHandlers([
  {
    type: 'test-ipc',
    handler: ({ sendToClient }) => (arg1, arg2) => {
      logger.info(`[${id}] test ipc from plugin:`, arg1, arg2);
      // 主动推送给 UI（可选）：UI 端 ipc.on('test-ipc-reply', callback) 接收
      sendToClient(`test-ipc-reply@${id}`, 'test ipc reply from plugin');
      return { success: true, message: '响应结果' };
    },
  },
]);

// 跨插件通信（可选）：导出 libs 对象，其他插件可通过 usePluginInterop() 访问
let counter = 0;
const counterListeners = new Set();

const libs = {
  getCounter: () => counter,
  increment: () => {
    counter += 1;
    counterListeners.forEach((fn) => fn(counter));
  },
  onCounterChanged: (fn) => {
    counterListeners.add(fn);
    return () => counterListeners.delete(fn);
  },
};

// 插件命令：与 package.json 中 plugin.contributes.commands 的静态声明配套，
// 宿主会先激活插件再执行对应 handler
const commands = [
  {
    id: 'translime-plugin-example.increment-counter',
    handler() {
      libs.increment();
      return libs.getCounter();
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
  libs,
};
