import { BrowserWindow } from 'electron';
import createProtocol from './createProtocol';

export default (fileUrl, browserWindowOptions, menu = false) => {
  let window = new BrowserWindow({
    width: 200,
    height: 200,
    frame: true,
    show: false,
    minWidth: 200,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true, // 默认开启上下文隔离
      sandbox: true,
    },
    ...browserWindowOptions,
  });

  if (fileUrl.startsWith('file://') || /^https?:\/\//i.test(fileUrl)) {
    window.loadURL(fileUrl);
  } else if (import.meta.env.VITE_DEV_SERVER_URL !== undefined) {
    // Load the url of the dev server if in development mode
    window.loadURL(`${import.meta.env.VITE_DEV_SERVER_URL}${fileUrl}`).then(() => {
      if (!process.env.IS_TEST) window.webContents.openDevTools({ mode: 'undocked' });
    });
  } else {
    createProtocol('app');
    // Load the index.html when not in development
    window.loadURL(`app://./${fileUrl}`);
  }

  window.once('ready-to-show', () => {
    if (menu !== false) {
      window.setMenu(menu);
    }
    window.show();
  });

  window.on('closed', () => {
    window = null;
  });

  return window;
};
