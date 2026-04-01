/* eslint-disable no-param-reassign */
import fs from 'node:fs';
import mainStore from '../../utils/useMainStore';
import {
  ACTIVATION_ON_STARTUP,
  isPluginPackageName,
  PLUGIN_DIR,
  PLUGIN_DIR_DEV,
  PLUGIN_JSON_PATH,
  PLUGIN_MODULES_PATH_DEV,
  PLUGIN_SOURCE_DEV,
  PLUGIN_SOURCE_RELEASE,
  resolvePluginPath,
} from './constants';
import {
  createRuntimeState,
  pathExists,
  readPluginSafe,
  refreshPluginStatus,
  uniqueStrings,
} from './metadata';

/**
 * 插件发现与索引构建逻辑。
 *
 * 这一层负责初始化目录、扫描插件、建立依赖关系，
 * 并为运行时模块准备命令与 IPC 激活索引。
 */

/**
 * 初始化插件目录、package.json 和开发插件目录。
 *
 * 同时会注册 `.node` 影子加载补丁，并在启动时清理历史临时文件。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @returns {void}
 */
const initPluginLoader = (loader) => {
  loader.cleanTempNodeFiles();
  loader.setupNodeLoaderHack();
  fs.access(PLUGIN_JSON_PATH, fs.constants.F_OK, (err) => {
    if (err) {
      const pkg = {
        name: 'translime-plugins',
        description: 'translime-plugins',
        license: 'MIT',
        dependencies: {},
      };
      try {
        fs.accessSync(PLUGIN_DIR);
      } catch (accessError) {
        fs.mkdirSync(PLUGIN_DIR);
      }
      fs.writeFileSync(
        PLUGIN_JSON_PATH,
        JSON.stringify(pkg, null, 2),
        'utf8',
      );
    }
  });

  try {
    fs.accessSync(loader.pluginPackageDir);
  } catch (err) {
    fs.mkdirSync(loader.pluginPackageDir);
  }

  try {
    fs.accessSync(PLUGIN_DIR_DEV);
  } catch (err) {
    fs.mkdirSync(PLUGIN_DIR_DEV);
  }
};

/**
 * 重新构建插件依赖图与阻塞状态。
 *
 * 这个过程会刷新：
 * - 必需依赖缺失
 * - 可选依赖缺失
 * - 依赖链反向索引
 * - 循环依赖
 * - 被不可用依赖阻塞的插件集合
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @returns {void}
 */
const buildDependencyGraph = (loader) => {
  const pluginMap = new Map(loader.plugins.map((plugin) => [plugin.packageName, plugin]));

  loader.plugins.forEach((plugin) => {
    Object.assign(plugin, {
      missingDependencies: [],
      missingOptionalDependencies: [],
      blockedBy: [],
      cycleDependencies: [],
      dependents: [],
      dependencyOf: [],
    });
  });

  loader.plugins.forEach((plugin) => {
    plugin.dependencies.forEach((dependencyId) => {
      const dependency = pluginMap.get(dependencyId);
      if (!dependency) {
        plugin.missingDependencies.push(dependencyId);
        return;
      }
      plugin.dependencyOf.push(dependencyId);
      dependency.dependents.push(plugin.packageName);
    });

    plugin.optionalDependencies.forEach((dependencyId) => {
      if (!pluginMap.has(dependencyId)) {
        plugin.missingOptionalDependencies.push(dependencyId);
      }
    });
  });

  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  const visit = (pluginId) => {
    if (visited.has(pluginId)) {
      return;
    }

    if (visiting.has(pluginId)) {
      const startIndex = stack.indexOf(pluginId);
      const cycleNodes = stack.slice(startIndex).concat(pluginId);
      cycleNodes.forEach((id) => {
        const cyclePlugin = pluginMap.get(id);
        if (cyclePlugin) {
          cyclePlugin.cycleDependencies = uniqueStrings(cycleNodes.filter((item) => item !== id));
        }
      });
      return;
    }

    const plugin = pluginMap.get(pluginId);
    if (!plugin) {
      return;
    }

    visiting.add(pluginId);
    stack.push(pluginId);
    plugin.dependencies.forEach((dependencyId) => {
      if (pluginMap.has(dependencyId)) {
        visit(dependencyId);
      }
    });
    stack.pop();
    visiting.delete(pluginId);
    visited.add(pluginId);
  };

  loader.plugins.forEach((plugin) => {
    visit(plugin.packageName);
  });

  loader.plugins.forEach((plugin) => {
    plugin.dependencies.forEach((dependencyId) => {
      const dependency = pluginMap.get(dependencyId);
      if (dependency && dependency.available === false) {
        plugin.blockedBy.push(dependencyId);
      }
    });
    Object.assign(plugin, refreshPluginStatus(plugin));
  });
};

/**
 * 重建命令注册表和 IPC 懒激活索引。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @returns {void}
 */
const rebuildActivationIndexes = (loader) => {
  loader.commandRegistry.clear();
  loader.runtimeCommandHandlers.clear();
  loader.ipcActivationRegistry.clear();

  loader.plugins.forEach((plugin) => {
    plugin.contributes.commands.forEach((command) => {
      loader.commandRegistry.set(command.id, {
        pluginId: plugin.packageName,
        title: command.title,
      });
    });

    plugin.ipcActivationTypes.forEach((type) => {
      loader.ipcActivationRegistry.set(`${type}@${plugin.packageName}`, plugin.packageName);
    });
  });
};

/**
 * 激活所有声明为 `onStartup` 的已启用插件。
 *
 * 对不需要立即激活的插件，也会同步刷新一次状态文本。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @returns {void}
 */
const activateStartupPlugins = (loader) => {
  loader.plugins.forEach((plugin) => {
    if (!plugin.enabled) {
      return;
    }

    if (plugin.activationEvents.includes(ACTIVATION_ON_STARTUP)) {
      loader.enablePlugin(plugin.packageName, true);
    } else {
      Object.assign(plugin, refreshPluginStatus(plugin));
    }
  });
};

/**
 * 扫描正式插件与开发插件目录，并重建整体插件状态。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @returns {Array<object>} 最新插件列表。
 */
const resolvePlugins = (loader) => {
  try {
    fs.accessSync(PLUGIN_MODULES_PATH_DEV);
  } catch (err) {
    fs.mkdirSync(PLUGIN_MODULES_PATH_DEV);
  }

  const showDevPlugin = mainStore.config.get('setting.showDevPlugin', false);
  const json = JSON.parse(fs.readFileSync(PLUGIN_JSON_PATH, 'utf8'));
  const deps = Object.keys(json.dependencies || {});
  loader.plugins = [];

  const filterFn = (isDev = false) => (name) => {
    if (!isPluginPackageName(name)) {
      return false;
    }
    const pluginPath = resolvePluginPath(name, isDev);
    return pathExists(pluginPath);
  };

  const devModules = showDevPlugin
    ? fs.readdirSync(PLUGIN_MODULES_PATH_DEV)
      .filter(filterFn(true))
      .map((pluginName) => readPluginSafe(resolvePluginPath(pluginName, true), {
        source: PLUGIN_SOURCE_DEV,
      }))
    : [];

  const modules = deps
    .filter(filterFn())
    .map((pluginName) => readPluginSafe(resolvePluginPath(pluginName), {
      source: PLUGIN_SOURCE_RELEASE,
      devPlugins: devModules,
    }))
    .filter(Boolean);

  loader.plugins = [...modules, ...devModules];
  buildDependencyGraph(loader);
  rebuildActivationIndexes(loader);
  activateStartupPlugins(loader);
  loader.emit('init', loader.plugins);
  return loader.plugins;
};

/**
 * 用外部传入的插件列表直接替换当前插件状态。
 *
 * 这个入口主要服务于测试和受控初始化场景，
 * 会为缺失字段补齐默认值并重新建立索引。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {Array<object>} plugins - 要挂载的插件列表。
 * @returns {void}
 */
const enablePlugins = (loader, plugins) => {
  loader.plugins = plugins.map((plugin) => refreshPluginStatus({
    activationEvents: [ACTIVATION_ON_STARTUP],
    dependencies: [],
    optionalDependencies: [],
    contributes: { commands: [] },
    ipcActivationTypes: [],
    commandActivationIds: [],
    missingDependencies: [],
    missingOptionalDependencies: [],
    blockedBy: [],
    cycleDependencies: [],
    dependents: [],
    dependencyOf: [],
    entryIssues: [],
    active: false,
    status: 'discovered',
    statusText: '',
    lastError: '',
    loadTime: 0,
    ...createRuntimeState(),
    ...plugin,
  }));
  rebuildActivationIndexes(loader);
  activateStartupPlugins(loader);
  loader.emit('init', loader.plugins);
};

export {
  activateStartupPlugins,
  buildDependencyGraph,
  enablePlugins,
  initPluginLoader,
  rebuildActivationIndexes,
  resolvePlugins,
};
