import { app } from 'electron';
import path from 'path';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { parseAppArgv, parseDeepLink } from './utils';
import logger from '@pkg/main/logger';

export const linkHandler = (url) => {
  logger.info('通过 depp link 启动', { url });
  const link = parseDeepLink(url);
  if (!link.main) {
    return;
  }

  switch (link.main) {
    case 'open':
      global.mainStore.ipc().sendToClient(ipcType.DEEP_LINK_OPEN, link.params);
      break;
    case 'plugin':
      // todo: 插件扩展
      break;
    default:
      break;
  }
};

const setupDeepLink = () => {
  const appArgs = parseAppArgv(process.argv);
  if (appArgs.url) {
    linkHandler(appArgs.url);
  }
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('translime', process.execPath, [path.resolve(process.argv[2])]);
    }
  } else {
    app.setAsDefaultProtocolClient('translime');
  }
};

export default setupDeepLink;
