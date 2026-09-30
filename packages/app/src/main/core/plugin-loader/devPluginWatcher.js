import fs from 'node:fs';
import path from 'node:path';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import mainStore from '../../utils/useMainStore';
import appManager from '../../utils/useAppManager';
import logger from '../../utils/logger';

/**
 * 开发插件构建产物监听。
 *
 * 「显示开发中插件」开启时，监听各已启用开发插件的 `dist` 目录，
 * 构建产物变化后防抖自动重启对应插件，免去每次构建后手动
 * 右键「重启插件」。只作用于 dev 插件，发布插件不受影响。
 *
 * 监听器在每次 `resolvePlugins` 后与插件列表重新对齐：
 * 新启用/出现的 dev 插件补充监听，不再启用或消失的移除监听。
 */

const RESTART_DEBOUNCE_MS = 800;

/** 插件包名 → 该插件 dist 目录的 FSWatcher。 */
const distWatchers = new Map();
/** 插件包名 → 防抖定时器。 */
const restartTimers = new Map();

const sendPluginsChanged = () => {
  try {
    const ipc = appManager.getIpc();
    if (ipc) {
      ipc.sendToMain(ipcType.PLUGINS_CHANGED);
    }
  } catch (err) {
    logger.debug('[plugin] 广播插件变更失败', { error: err.message });
  }
};

const closeWatcher = (packageName) => {
  const watcher = distWatchers.get(packageName);
  if (watcher) {
    distWatchers.delete(packageName);
    watcher.close();
  }
};

const clearRestartTimer = (packageName) => {
  const timer = restartTimers.get(packageName);
  if (timer) {
    restartTimers.delete(packageName);
    clearTimeout(timer);
  }
};

const scheduleRestart = (loader, packageName) => {
  clearRestartTimer(packageName);
  restartTimers.set(
    packageName,
    setTimeout(() => {
      restartTimers.delete(packageName);
      const plugin = loader.getPlugin(packageName);
      if (!plugin || !plugin.enabled || !plugin.dev) {
        return;
      }
      try {
        loader.restartPlugin(packageName);
        logger.info(`[plugin] 开发插件 "${packageName}" 构建产物变化，已自动重启`);
        sendPluginsChanged();
      } catch (err) {
        logger.warn(`[plugin] 开发插件 "${packageName}" 自动重启失败`, {
          error: err.message,
        });
      }
    }, RESTART_DEBOUNCE_MS),
  );
};

const watchPluginDist = (loader, plugin) => {
  if (distWatchers.has(plugin.packageName)) {
    return;
  }
  let distPath;
  try {
    // pluginPath 可能是进入 plugins_dev 的链接，监听真实目录
    distPath = path.join(fs.realpathSync(plugin.pluginPath), 'dist');
  } catch (err) {
    logger.debug(`[plugin] 解析插件 "${plugin.packageName}" 真实目录失败`, {
      error: err.message,
    });
    return;
  }
  if (!fs.existsSync(distPath)) {
    return;
  }

  try {
    const watcher = fs.watch(distPath, { recursive: true }, () => {
      scheduleRestart(loader, plugin.packageName);
    });
    watcher.on('error', (err) => {
      logger.warn(`[plugin] 监听插件 "${plugin.packageName}" 构建产物失败`, {
        error: err.message,
      });
      closeWatcher(plugin.packageName);
    });
    distWatchers.set(plugin.packageName, watcher);
  } catch (err) {
    logger.warn(`[plugin] 无法监听插件 "${plugin.packageName}" 的构建产物`, {
      error: err.message,
    });
  }
};

/**
 * 让 dev 插件监听器与当前插件列表对齐。
 *
 * 在 `resolvePlugins` 结束时调用；未开启「显示开发中插件」时
 * 不持有任何监听器。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @returns {void}
 */
const syncDevPluginWatchers = (loader) => {
  const showDevPlugin = mainStore.config.get('setting.showDevPlugin', false);

  if (!showDevPlugin) {
    distWatchers.forEach((_watcher, packageName) => {
      clearRestartTimer(packageName);
      closeWatcher(packageName);
    });
    return;
  }

  const watchable = new Set();
  loader.plugins.forEach((plugin) => {
    if (plugin.dev && plugin.enabled) {
      watchable.add(plugin.packageName);
      watchPluginDist(loader, plugin);
    }
  });
  distWatchers.forEach((_watcher, packageName) => {
    if (!watchable.has(packageName)) {
      clearRestartTimer(packageName);
      closeWatcher(packageName);
    }
  });
};

/**
 * 应用退出或插件体系关闭时释放全部监听器。
 *
 * @returns {void}
 */
const closeDevPluginWatchers = () => {
  distWatchers.forEach((_watcher, packageName) => {
    clearRestartTimer(packageName);
    closeWatcher(packageName);
  });
};

export {
  closeDevPluginWatchers,
  syncDevPluginWatchers,
};
