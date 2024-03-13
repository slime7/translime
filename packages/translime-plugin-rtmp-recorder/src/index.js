import ffmpeg from 'fluent-ffmpeg';
import pkg from '../package.json';
import record from './record';

const id = pkg.name;
const config = global.store || global.mainStore.config;

const setFfmpegPath = (ff, settingPath) => {
  if (typeof settingPath?.[0] === 'string') {
    ff.setFfmpegPath(settingPath[0]);
  }
};

// ipc 定义
const ipcHandlers = [
  {
    type: 'record',
    handler: ({ sendToClient }) => (args) => {
      record.start(sendToClient, args);
    },
  },
  {
    type: 'stop',
    handler: () => (taskId) => {
      if (taskId) {
        record.stop(taskId, true);
      } else {
        record.stopAll();
      }
    },
  },
];

// 加载时执行
const pluginDidLoad = () => {
  const setting = config.get(`plugin.${id}.settings`, {});
  if (setting['ffmpeg-path']) {
    setFfmpegPath(ffmpeg, setting['ffmpeg-path']);
  }
};

// 禁用时执行
const pluginWillUnload = () => {
  record.stopAll();
};

const pluginSettingSaved = () => {
  const setting = config.get(`plugin.${id}.settings`, {});
  if (setting['ffmpeg-path']) {
    setFfmpegPath(ffmpeg, setting['ffmpeg-path']);
  }
};

// 插件设置表单
const settingMenu = [
  {
    key: 'ffmpeg-path',
    type: 'file',
    name: 'ffmpeg 路径',
    required: false,
    placeholder: '不设置则会查找系统环境变量中的 ffmpeg，没有找到则无法运行',
    dialogOptions: {
      filters: [
        { name: 'ffmpeg', extensions: ['exe'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile', 'dontAddToRecent'],
    },
  },
];

export default {
  pluginDidLoad,
  pluginWillUnload,
  pluginSettingSaved,
  settingMenu,
  ipcHandlers,
};
