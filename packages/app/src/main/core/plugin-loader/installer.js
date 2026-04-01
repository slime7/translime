/* eslint-disable no-param-reassign */
import path from 'node:path';
import fsp from 'node:fs/promises';
import mainStore from '../../utils/useMainStore';
import logger from '../../utils/logger';
import { PLUGIN_MODULES_PATH } from './constants';
import {
  downloadTarball,
  extractTarball,
  fetchPackageMetadata,
  getLocalPackagePath,
  getTarballPath,
  readPluginPackageInfo,
  updatePluginDependency,
} from './packageInstaller';

/**
 * 插件安装、卸载与开发插件刷新流程。
 *
 * 这里编排安装步骤本身，真正的 tarball、registry 与 package.json 操作
 * 则继续委托给 `packageInstaller.js`。
 */

/**
 * 从 tarball 完成一次完整安装并刷新插件状态。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {string} packageName - 插件包名。
 * @param {string} tarballPath - tarball 文件路径。
 * @param {string} version - 安装版本。
 * @returns {Promise<{success: boolean, version: string, warnings: Array<string>}>}
 * 安装结果摘要。
 */
const doInstallFromTarball = async (loader, packageName, tarballPath, version) => {
  try {
    await extractTarball(tarballPath, packageName);
    await updatePluginDependency(packageName, version, 'add');

    loader.resolvePlugins();
    let plugin = loader.getPlugin(packageName);
    if (!plugin) {
      plugin = loader.enablePlugin(packageName);
    }
    if (plugin) {
      plugin.enabled = true;
      mainStore.config.set(`plugin.${packageName}.enabled`, true);
      loader.enablePlugin(packageName);
    }
    loader.emit('plugin:installed', { plugin, pluginId: packageName });

    logger.info(`[plugin] 安装插件 ${packageName}@${version} 成功`);
    return {
      success: true,
      version,
      warnings: plugin?.missingDependencies?.length
        ? [`缺少前置插件：${plugin.missingDependencies.join('、')}`]
        : [],
    };
  } catch (err) {
    logger.error(`[plugin] 安装插件 ${packageName} 失败`, { error: err.message });
    loader.emit('plugin:error', {
      plugin: null,
      pluginId: packageName,
      error: err,
      operation: 'install',
    });
    throw err;
  }
};

/**
 * 从远程 registry 下载并安装插件。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {string} packageName - 插件包名。
 * @param {string} [version] - 指定版本；为空时安装 latest。
 * @returns {Promise<{success: boolean, version: string, warnings: Array<string>}>}
 * 安装结果摘要。
 */
const installPlugin = async (loader, packageName, version) => {
  if (!/^translime-plugin-/.test(packageName)) {
    throw new Error('该包不是这个软件的插件');
  }

  if (loader.getPlugin(packageName)) {
    await loader.uninstallPlugin(packageName);
  }

  const metadata = await fetchPackageMetadata(packageName, version);
  if (!metadata.tarball) {
    throw new Error('无法获取插件下载地址');
  }

  const tarballPath = getTarballPath(packageName, metadata.version);
  await downloadTarball(metadata.tarball, tarballPath);

  return doInstallFromTarball(loader, packageName, tarballPath, metadata.version);
};

/**
 * 从本地 tarball 安装插件。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {string} file - 本地 tarball 文件路径。
 * @returns {Promise<{success: boolean, version: string, warnings: Array<string>}>}
 * 安装结果摘要。
 */
const installLocalPlugin = async (loader, file) => {
  const pluginPackagePath = getLocalPackagePath(file);
  await fsp.copyFile(file, pluginPackagePath);

  const pluginPackageInfo = await readPluginPackageInfo(pluginPackagePath);
  const packageName = pluginPackageInfo.name;

  if (!/^translime-plugin-/.test(packageName)) {
    throw new Error('该包不是这个软件的插件');
  }

  if (loader.getPlugin(packageName)) {
    await loader.uninstallPlugin(packageName);
  }

  return doInstallFromTarball(
    loader,
    packageName,
    pluginPackagePath,
    pluginPackageInfo.version,
  );
};

/**
 * 卸载插件并从插件依赖清单中移除对应记录。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {string} packageName - 插件包名。
 * @returns {Promise<void>}
 */
const uninstallPlugin = async (loader, packageName) => {
  loader.disablePlugin(packageName, true);

  try {
    const pluginDir = path.join(PLUGIN_MODULES_PATH, packageName);
    await fsp.rm(pluginDir, { recursive: true, force: true });
    await updatePluginDependency(packageName, null, 'remove');
    loader.resolvePlugins();

    loader.emit('plugin:uninstalled', { plugin: null, pluginId: packageName });
    logger.info(`[plugin] 卸载插件 ${packageName} 成功`);
  } catch (err) {
    logger.error(`[plugin] 卸载插件 ${packageName} 失败`, { error: err.message });
    loader.emit('plugin:error', {
      plugin: null,
      pluginId: packageName,
      error: err,
      operation: 'uninstall',
    });
    throw err;
  }
};

/**
 * 重新扫描开发插件目录。
 *
 * 会先关闭所有当前启用的插件，再重新走一次完整扫描流程，
 * 用于开发调试时刷新最新构建结果。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @returns {Array<object>} 刷新后的插件列表。
 */
const refreshDevPlugins = (loader) => {
  const previousPlugins = [...loader.plugins];
  previousPlugins.forEach((plugin) => {
    if (plugin.enabled) {
      loader.disablePlugin(plugin.packageName, {
        keepDisabledRecord: false,
        persistState: false,
      });
    }
  });
  loader.plugins = [];
  return loader.resolvePlugins();
};

export {
  doInstallFromTarball,
  installLocalPlugin,
  installPlugin,
  refreshDevPlugins,
  uninstallPlugin,
};
