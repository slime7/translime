import fs from 'node:fs';
import path from 'node:path';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import mainStore from '../../utils/useMainStore';
import appManager from '../../utils/useAppManager';
import logger from '../../utils/logger';
import { PLUGIN_STATUS_LOAD_ERROR } from './constants';
import createDistChangeDetector from './distChangeDetector';

/**
 * 开发插件构建产物监听。
 *
 * 「显示开发中插件」开启时，监听各已启用开发插件的 `dist` 目录，
 * 构建产物变化后防抖自动重启对应插件，免去每次构建后手动
 * 右键「重启插件」。只作用于 dev 插件，发布插件不受影响。
 *
 * 事件到达后先与产物快照对比：读取产物（如打开插件 UI 时加载
 * `dist/ui.esm.js`）只改变访问属性、不改 mtime，不得触发重启。
 *
 * 重启落在产物半成品上（构建器尚未写完）进入 load-error 时保留监听：
 * 后续产物变化会再次触发重启，插件自愈恢复，无需手动重启。
 *
 * 监听器在每次 `resolvePlugins` 后与插件列表重新对齐：
 * 新启用/出现的 dev 插件补充监听，不再启用或消失的移除监听。
 */

const RESTART_DEBOUNCE_MS = 800;

/** 插件包名 → 该插件 dist 目录的 FSWatcher。 */
const distWatchers = new Map();
/** 插件包名 → 防抖定时器。 */
const restartTimers = new Map();

/**
 * 插件是否应被监听：已启用，或自动重启失败进入 load-error 等待产物修复。
 *
 * @param {object} plugin - 插件对象。
 * @returns {boolean} 是否监听。
 */
const shouldWatchPlugin = (plugin) => plugin.enabled
  || plugin.status === PLUGIN_STATUS_LOAD_ERROR;

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
    setTimeout(async () => {
      restartTimers.delete(packageName);
      const plugin = loader.getPlugin(packageName);
      if (!plugin || !plugin.dev || !shouldWatchPlugin(plugin)) {
        return;
      }
      try {
        const restarted = await loader.restartPlugin(packageName);
        if (restarted?.enabled) {
          logger.info(`[plugin] 开发插件 "${packageName}" 构建产物变化，已自动重启`);
        } else {
          logger.warn(`[plugin] 开发插件 "${packageName}" 自动重启后仍不可用，等待产物下次变化后重试`);
        }
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
    const detector = createDistChangeDetector({ distPath });
    const watcher = fs.watch(distPath, { recursive: true }, (_eventType, filename) => {
      if (detector.handleWatchEvent(filename)) {
        scheduleRestart(loader, plugin.packageName);
      }
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
    if (plugin.dev && shouldWatchPlugin(plugin)) {
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
