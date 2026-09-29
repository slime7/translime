import { clipboard } from 'electron';
import { registerMenu } from './menuRegistry';

const isMac = process.platform === 'darwin';

/** 把 Electron accelerator 缩写转换为菜单内展示用的快捷键文本。 */
const formatAccelerator = (accelerator) => accelerator
  .replace('CommandOrControl', isMac ? '⌘' : 'Ctrl')
  .replace(/\+/g, ' ');

/** 编辑动作须在原 webContents 上执行，等价于原生 role 项的行为。 */
const invokeWhenAlive = (sender, method) => () => {
  if (sender && !sender.isDestroyed()) {
    sender[method]();
  }
};

/**
 * 构建文本编辑上下文菜单（撤销/重做与剪贴板操作）的可序列化描述，
 * 交给发起请求的窗口渲染端 mat-menu 展示。
 *
 * @param {import('electron').WebContents} sender - 发起菜单请求的 webContents。
 * @param {{selectedText?: string}} [options] - 渲染端传入的当前选中文本。
 * @returns {{menuId: string, items: Array<object>}} 渲染端菜单描述。
 */
const buildTextEditMenu = (sender, { selectedText = '' } = {}) => {
  const textMenuItems = [
    {
      id: 'undo',
      label: '撤销',
      shortcut: 'CommandOrControl+Z',
      click: invokeWhenAlive(sender, 'undo'),
    },
    {
      id: 'redo',
      label: '重做',
      shortcut: 'CommandOrControl+Y',
      click: invokeWhenAlive(sender, 'redo'),
    },
    { type: 'separator' },
    {
      id: 'cut',
      label: '剪切',
      shortcut: 'CommandOrControl+X',
      enabled: Boolean(selectedText),
      click: invokeWhenAlive(sender, 'cut'),
    },
    {
      id: 'copy',
      label: '复制',
      shortcut: 'CommandOrControl+C',
      enabled: Boolean(selectedText),
      click: invokeWhenAlive(sender, 'copy'),
    },
    {
      id: 'paste',
      label: '粘贴',
      shortcut: 'CommandOrControl+V',
      enabled: Boolean(clipboard.readText()),
      click: invokeWhenAlive(sender, 'paste'),
    },
  ];

  const actions = new Map();
  const items = textMenuItems.map((item) => {
    if (item.type === 'separator') {
      return item;
    }
    actions.set(item.id, item.click);
    return {
      id: item.id,
      label: item.label,
      ...(item.enabled === undefined ? {} : { enabled: item.enabled }),
      ...(item.shortcut ? { shortcut: formatAccelerator(item.shortcut) } : {}),
    };
  });

  return { menuId: registerMenu(actions), items };
};

export default buildTextEditMenu;
