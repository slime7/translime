import { app } from 'electron';
import path from 'node:path';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import logger from '../utils/logger';
import pluginLoader from './pluginLoader';
import deepLinkRegistry from './deepLinkRegistry';
import { parseAppArgv, parseDeepLink } from '../utils';

const PROTOCOL = 'translime';
// 开发模式（electron .）不注册正式 scheme，避免覆盖安装版的 translime:// 注册；
// dev 实例改用独立 scheme，两条深链分别路由到各自的 userData 实例
const DEV_PROTOCOL = 'translime-dev';

const PLUGIN_ID_PREFIX = 'translime-plugin-';

/**
 * 深链插件段支持省略 `translime-plugin-` 前缀：
 * `translime://plugin/scrcpy-wrapper/abc` 与完整包名等价。
 */
const resolveDeepLinkPlugin = (segment) => {
  const name = String(segment || '').trim();
  if (!name) {
    return null;
  }
  return pluginLoader.getPlugin(name)
    ?? pluginLoader.getPlugin(`${PLUGIN_ID_PREFIX}${name}`)
    ?? null;
};

/**
 * 插件深链转发：先确保插件激活（处理函数在激活时注册），再按路径分发。
 * 分发在主进程内完成，不经过渲染端。
 */
const handlePluginDeepLink = async (link) => {
  const [pluginSegment, ...rest] = String(link.path ?? '').split('/');
  const plugin = resolveDeepLinkPlugin(pluginSegment);
  if (!plugin) {
    logger.warn(`[deep link] 未找到深链目标插件: ${pluginSegment || '(空)'}`);
    return;
  }
  if (!plugin.enabled) {
    logger.warn(`[deep link] 插件未启用，忽略深链: ${plugin.packageName}`);
    return;
  }
  const linkPath = rest.join('/');
  try {
    await pluginLoader.enablePlugin(plugin.packageName);
    const matched = deepLinkRegistry.dispatch(plugin.packageName, linkPath, link.params);
    if (!matched) {
      logger.warn(`[deep link] 插件 ${plugin.packageName} 未注册深链路径: ${linkPath || '(根路径)'}`);
    }
  } catch (err) {
    // 激活失败或插件处理函数异常都不允许影响宿主
    logger.error(`[deep link] 插件 ${plugin.packageName} 处理深链失败: ${err.message}`);
  }
};

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
    handlePluginDeepLink(link);
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
    const entryArg = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('.');
    const isIsolated = process.argv.includes('--isolate')
      || (typeof app.getPath === 'function' && app.getPath('userData').endsWith('translime-dev'));
    const protocol = isIsolated ? DEV_PROTOCOL : PROTOCOL;
    app.setAsDefaultProtocolClient(protocol, process.execPath, [entryArg]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
};

export default setupDeepLink;
