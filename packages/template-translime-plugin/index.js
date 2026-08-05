import { useLogger, usePluginConfig, usePluginInterop } from 'translime-sdk';
import EventEmitter from 'node:events';

const id = 'translime-plugin-example';
const baseLogger = useLogger();
const logger = baseLogger.child ? baseLogger.child({ plugin_id: id, context: 'Main' }) : baseLogger;

const pluginConfig = usePluginConfig(id);
let captureCompleteListener = null;
let activeHdrApi = null;

const registerHdrCaptureListener = (hdrApi) => {
  if (!hdrApi) return;
  // 如果之前已经注册过，先移除
  if (activeHdrApi && captureCompleteListener) {
    activeHdrApi.offCaptureComplete(captureCompleteListener);
  }

  captureCompleteListener = ({ path, hdrPath, type }) => {
    logger.info(`[${id}] 截图完成: type=${type}, path=${path}, hdrPath=${hdrPath}`);
  };

  hdrApi.onCaptureComplete(captureCompleteListener);
  activeHdrApi = hdrApi;
};

const unregisterHdrCaptureListener = () => {
  if (activeHdrApi && captureCompleteListener) {
    activeHdrApi.offCaptureComplete(captureCompleteListener);
  }
  captureCompleteListener = null;
  activeHdrApi = null;
};

let activateListener = null;

// 加载时执行
const pluginDidLoad = () => {
  // eslint-disable-next-line no-console
  console.log('plugin loaded');
  const setting = pluginConfig.get('setting', {});
  // eslint-disable-next-line no-console
  console.log('settings: ', setting);

  const interop = usePluginInterop();
  if (interop) {
    // 启动时如果 HDR 截图插件已启用，则直接注册监听
    const hdrApi = interop.getExports('translime-plugin-hdr-capture');
    registerHdrCaptureListener(hdrApi);

    // 监听后续插件状态变化（例如禁用后重新启用）
    activateListener = (pluginId, exports) => {
      if (pluginId === 'translime-plugin-hdr-capture') {
        // eslint-disable-next-line no-console
        console.log(`[${id}] 监听到 HDR 截图插件激活，重新注册监听器`);
        registerHdrCaptureListener(exports);
      }
    };
    interop.on('activated', activateListener);
  }
};

// 禁用时执行
const pluginWillUnload = () => {
  // eslint-disable-next-line no-console
  console.log('plugin unloaded');

  // 移除捕获回调监听
  unregisterHdrCaptureListener();

  const interop = usePluginInterop();
  if (interop && activateListener) {
    interop.off('activated', activateListener);
    activateListener = null;
  }
};

// 设置保存时执行
const pluginSettingSaved = () => {
  // eslint-disable-next-line no-console
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

// 插件上下文菜单
// https://www.electronjs.org/zh/docs/latest/api/menu-item
const pluginMenu = [
  {
    id: `${id}-custom-menu`,
    label: 'custom menu',
    click() {
      // eslint-disable-next-line no-console
      console.log('custom menu clicked');
    },
  },
];

// ipc 定义
const ipcHandlers = [
  {
    type: 'test-ipc', // 调用时需加上`@${id}`，此处为 'test-ipc@translime-plugin-example'
    handler: ({ sendToClient }) => (arg1, arg2) => {
      // eslint-disable-next-line no-console
      console.log('test-ipc', 'test ipc from plugin: ', arg1, arg2);
      sendToClient(`test-ipc-reply@${id}`, 'test ipc reply from plugin');
    },
  },
];

// 跨插件通信（可选）
// 通过导出 libs 对象，可以将数据、方法或事件暴露给其他插件使用
const bus = new EventEmitter();
let counter = 0;

const libs = {
  getCounter: () => counter,
  increment: () => {
    counter += 1;
    bus.emit('counter-changed', counter);
  },
  onCounterChanged: (fn) => bus.on('counter-changed', fn),
  offCounterChanged: (fn) => bus.off('counter-changed', fn),
};

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
