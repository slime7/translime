import { app } from 'electron';
import path from 'node:path';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import logger from '../utils/logger';
import { parseAppArgv, parseDeepLink } from '../utils';

const PROTOCOL = 'translime';
// 开发模式（electron .）不注册正式 scheme，避免覆盖安装版的 translime:// 注册；
// dev 实例改用独立 scheme，两条深链分别路由到各自的 userData 实例
const DEV_PROTOCOL = 'translime-dev';

export const linkHandler = (url) => {
  logger.info('通过 depp link 启动', { url });
  const link = parseDeepLink(url);
  if (!link.main) {
    return;
  }

  switch (link.main) {
  case 'open':
    global.mainStore.ipc().sendToMain(ipcType.DEEP_LINK_OPEN, link.params);
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
      app.setAsDefaultProtocolClient(DEV_PROTOCOL, process.execPath, [path.resolve(process.argv[2])]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
};

export default setupDeepLink;
