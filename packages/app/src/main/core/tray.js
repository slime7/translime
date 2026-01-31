import {
  app,
  Menu,
  nativeImage,
  Tray,
} from 'electron';
import icon from '@pkg/share/static/icon.png';
import mainStore from '../utils/useMainStore';
import appManager from '../utils/useAppManager';

const createTray = () => {
  appManager.setTray(new Tray(nativeImage.createFromDataURL(icon)));

  const items = [
    {
      label: 'translime',
      enabled: false,
    },
    {
      type: 'separator',
    },
    {
      label: '打开',
      click() {
        if (appManager.getWin()) {
          appManager.getWin().show();
        }
      },
    },
    {
      label: '退出',
      click() {
        app.quit();
      },
    },
  ];
  const menu = Menu.buildFromTemplate(items);

  appManager.getTray().setToolTip(`translime ${mainStore.APP_VERSION}`);
  appManager.getTray().setContextMenu(menu);
  appManager.getTray().on('double-click', () => {
    if (appManager.getWin()) {
      appManager.getWin().show();
    }
  });
};

export default createTray;
