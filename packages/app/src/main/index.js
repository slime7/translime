import CreateElectronApp from './createElectronApp';
import logger from './utils/logger';

process.on('uncaughtException', (err) => {
  logger.error('主进程未捕获异常', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('主进程未处理的 Promise 拒绝', reason);
});

const createElectronApp = new CreateElectronApp();
createElectronApp.init();
