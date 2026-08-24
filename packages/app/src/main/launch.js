import {
  nativeImage,
  screen,
} from 'electron';
import icon from '@pkg/share/static/icon.png';
import createWindow from './utils/createWindow';
import appManager from './utils/useAppManager';

export default () => {
  const { workArea } = screen.getPrimaryDisplay();
  const isLinux = process.platform === 'linux';
  const appIcon = nativeImage.createFromDataURL(icon);
  const defaultWin = {
    x: workArea.width / 2 - 100,
    y: workArea.height / 2 - 100,
    width: 200,
    height: 200,
    maximize: false,
  };
  if (defaultWin.y < 0) {
    defaultWin.y = 0;
  }
  const {
    x,
    y,
    width,
    height,
  } = defaultWin;
  // Create the browser window.
  const launchWin = createWindow('launch.html', {
    ...(isLinux ? { center: true } : { x, y }),
    width,
    height,
    frame: false,
    show: false,
    transparent: true,
    minWidth: 200,
    skipTaskbar: true,
    icon: appIcon,
    ...(isLinux ? { type: 'splash' } : {}),
    webPreferences: {
      // Use pluginOptions.nodeIntegration, leave this alone
      // See https://github.com/nklayman/vue-cli-plugin-electron-builder/blob/v2/docs/guide/configuration.md#node-integration for more info
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  appManager.setLaunchWin(launchWin);
};
