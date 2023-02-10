import {
  screen,
} from 'electron';
import createWindow from './utils/createWindow';

export default () => {
  const { workArea } = screen.getPrimaryDisplay();
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
  global.launchWin = createWindow('launch.html', {
    x,
    y,
    width,
    height,
    frame: false,
    show: false,
    minWidth: 200,
    webPreferences: {
      // Use pluginOptions.nodeIntegration, leave this alone
      // See https://github.com/nklayman/vue-cli-plugin-electron-builder/blob/v2/docs/guide/configuration.md#node-integration for more info
      nodeIntegration: false,
      contextIsolation: false,
      sandbox: false,
    },
  });
};
