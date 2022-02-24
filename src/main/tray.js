import { Menu, nativeImage, Tray } from 'electron';
import icon from '@pkg/share/static/icon.png';

const createTray = () => {
  global.tray = new Tray(nativeImage.createFromDataURL(icon));

  const items = [
    {
      label: '退出',
      click() {
        if (global.win) {
          global.win.close();
        }
      },
    },
  ];
  const menu = Menu.buildFromTemplate(items);

  global.tray.setToolTip('translime');
  global.tray.setContextMenu(menu);
  global.tray.on('double-click', () => {
    if (global.win) {
      global.win.show();
    }
  });
};

export default createTray;
