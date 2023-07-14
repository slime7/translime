import { Menu, nativeImage, Tray } from 'electron';
import icon from '@pkg/share/static/icon.png';
import mainStore from '@pkg/main/utils/useMainStore';

const createTray = () => {
  mainStore.set('tray', new Tray(nativeImage.createFromDataURL(icon)));

  const items = [
    {
      label: '退出',
      click() {
        if (mainStore.getWin()) {
          mainStore.getWin().close();
        }
      },
    },
  ];
  const menu = Menu.buildFromTemplate(items);

  mainStore.get('tray').setToolTip('translime');
  mainStore.get('tray').setContextMenu(menu);
  mainStore.get('tray').on('double-click', () => {
    if (mainStore.getWin()) {
      mainStore.getWin().show();
    }
  });
};

export default createTray;
