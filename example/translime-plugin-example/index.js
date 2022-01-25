// eslint-disable-next-line import/no-unresolved
import ui from './ui.vue?raw';

export const windowMode = false;

// 加载时执行
export const pluginDidLoad = () => {
  console.log('plugin loaded');
};

// 禁用时执行
export const pluginWillUnload = () => {
  console.log('plugin unloaded');
};

// 插件设置表单
export const settingMenu = [];

// 插件菜单
export const pluginMenu = [];

export const main = ui;
