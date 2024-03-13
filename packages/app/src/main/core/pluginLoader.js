import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { app, clipboard, Menu } from 'electron';
import EventEmitter from 'events';
import childProcess from 'child_process';
import { createRequire } from 'module';
import tar from 'tar';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import mainStore from '../utils/useMainStore';
import logger from '../utils/logger';

const requireFresh = createRequire(import.meta.url);
const APPDATA_PATH = app.getPath('userData');
const PLUGIN_DIR = path.join(APPDATA_PATH, 'plugins');
const PLUGIN_DIR_DEV = path.join(APPDATA_PATH, 'plugins_dev');
const PLUGIN_JSON_PATH = path.join(PLUGIN_DIR, 'package.json');
const PLUGIN_MODULES_PATH = path.join(PLUGIN_DIR, 'node_modules');
const PLUGIN_MODULES_PATH_DEV = path.join(PLUGIN_DIR_DEV, 'node_modules');
const PLUGIN_PACKAGE_DIR = path.join(PLUGIN_DIR, 'package');
const NPM_EXEC_PATH = import.meta.env.DEV
  ? path.join(mainStore.ROOT, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js')
  : path.join(mainStore.ROOT, '..', 'app.asar.unpacked', 'node_modules', 'npm', 'bin', 'npm-cli.js');

const resolvePluginPath = (pluginName, isDevPlugin = false) => path.join(isDevPlugin ? PLUGIN_MODULES_PATH_DEV : PLUGIN_MODULES_PATH, pluginName);

async function readPluginPackageInfo(filePath) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath);
    const unzipStream = fileStream.pipe(zlib.createGunzip()); // 使用zlib库中的createGunzip方法将压缩包解压缩
    const extractStream = unzipStream.pipe(tar.extract({ cwd: mainStore.TEMP_DIR })); // 使用tar库中的extract方法解压缩后提取文件

    let found = false; // 添加一个标志来记录是否找到目标文件

    extractStream.on('entry', (entry) => {
      if (entry.path === 'package/package.json') { // 如果找到目标文件，则读取并返回其内容
        found = true; // 找到目标文件，将标志设置为true
        let content = '';
        entry.on('data', (chunk) => {
          content += chunk.toString();
        });
        entry.on('end', () => {
          try {
            resolve(JSON.parse(content));
          } catch (err) {
            reject(new Error('无法读取插件信息'));
          }
        });
      } else {
        entry.resume(); // 跳过非目标文件
      }
    });

    extractStream.on('end', () => {
      if (!found) { // 如果未找到目标文件，则Promise被拒绝
        reject(new Error('无法识别这个插件包'));
      }
    });

    extractStream.on('error', (error) => {
      reject(error);
    });
  });
}

const readPlugin = (pluginPath, devPlugins = null) => {
  const pluginPkg = JSON.parse(fs.readFileSync(path.join(pluginPath, 'package.json'), 'utf8'));
  const plugin = pluginPkg.plugin || {};
  plugin.packageName = pluginPkg.name;
  if (devPlugins && devPlugins.some((p) => p.packageName === plugin.packageName)) {
    // 优先加载 dev 插件
    return false;
  }
  if (!plugin.title) {
    plugin.title = pluginPkg.name;
  }
  if (!plugin.author) {
    plugin.author = pluginPkg.author ? pluginPkg.author.name : '';
  }
  if (!plugin.link) {
    plugin.link = pluginPkg.link || '';
  }
  if (!plugin.description) {
    plugin.description = pluginPkg.description || '';
  }
  if (plugin.icon) {
    const imgPath = path.resolve(pluginPath, plugin.icon);
    try {
      const mimeTypes = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        bmp: 'image/bmp',
        webp: 'image/webp',
      };
      const ext = path.extname(imgPath).toLowerCase().replace('.', '');
      plugin.icon = `data:${mimeTypes[ext]};base64, ${fs.readFileSync(imgPath, { encoding: 'base64' })}`;
    } catch (err) {
      plugin.icon = null;
    }
  } else {
    plugin.icon = null;
  }
  if (plugin.windowUrl) {
    plugin.windowUrl = (/^https?:\/\//i.test(plugin.windowUrl))
      ? plugin.windowUrl
      : `file://${path.resolve(pluginPath, plugin.windowUrl)}`;
  }
  if (plugin.ui) {
    plugin.ui = path.resolve(pluginPath, plugin.ui);
  }
  plugin.exports = pluginPkg.main ? pluginPkg.main : null;
  if (pluginPkg.exports) {
    if (pluginPkg.exports['.'] && pluginPkg.exports['.'].require) {
      plugin.exports = pluginPkg.exports['.'].require;
    }
  }
  plugin.pluginPath = pluginPath;
  plugin.version = pluginPkg.version;
  plugin.enabled = mainStore.config.get(`plugin.${plugin.packageName}.enabled`, true);
  if (!devPlugins) {
    plugin.dev = true;
  }

  return plugin;
};

const execNpmCommand = (cmd, module, options = {}) => {
  const internalOptions = {
    ...{
      registry: mainStore.config.get('setting.registry', 'https://registry.npmmirror.com/'),
    },
    ...options,
  };
  const args = [
    cmd,
  ];
  if (cmd === 'install') {
    args.push(...[
      '--no-progress',
      '--no-prune',
      '--install-strategy=shallow',
      '--ignore-scripts',
      '--legacy-peer-deps',
    ]);
  }
  if (cmd === 'uninstall') {
    args.push(...[
      '--no-progress',
      '--no-prune',
      '--install-strategy=shallow',
      '--ignore-scripts',
      '--legacy-peer-deps',
    ]);
  }
  if (internalOptions.registry) {
    args.push(`--registry=${internalOptions.registry}`);
  }
  if (internalOptions.proxy) {
    args.push(`--proxy=${internalOptions.proxy}`);
  }
  args.push(module);
  return new Promise((resolve) => {
    const npm = childProcess.fork(NPM_EXEC_PATH, args, {
      cwd: PLUGIN_DIR,
      silent: true,
    });

    let output = '';
    npm.stdout?.on('data', (data) => {
      output += data.toString();
    }).pipe(process.stdout);

    npm.stderr?.on('data', (data) => {
      output += data.toString();
    }).pipe(process.stderr);

    npm.on('close', (code) => {
      if (!code) {
        resolve({ code: 0, data: output });
      } else if (code && output.indexOf('code E404') > -1) {
        resolve({ code, data: `插件"${module}"不存在` });
      } else {
        resolve({ code, data: output });
      }
    });
    logger.debug('[plugin] npm 执行参数', { args: npm.spawnargs });
  });
};

const processPlugin = (plugin) => {
  // 运行插件加载方法
  if (typeof plugin.pluginDidLoad === 'function') {
    plugin.pluginDidLoad();
  }
};

class PluginLoader extends EventEmitter {
  init() {
    this.plugins = [];
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
        } catch (aErr) {
          fs.mkdirSync(PLUGIN_DIR);
        }
        try {
          fs.accessSync(PLUGIN_PACKAGE_DIR);
        } catch (aErr) {
          fs.mkdirSync(PLUGIN_PACKAGE_DIR);
        }
        fs.writeFileSync(PLUGIN_JSON_PATH, JSON.stringify(pkg, null, 2), 'utf8');
      }
    });

    try {
      fs.accessSync(PLUGIN_DIR_DEV);
    } catch (dErr) {
      fs.mkdirSync(PLUGIN_DIR_DEV);
    }
  }

  getPlugins() {
    if (!this.plugins.length) {
      this.readPlugins();
    }
    return this.plugins;
  }

  getPlugin(name) {
    return this.plugins.find((plugin) => plugin.packageName === name);
  }

  getPluginIndex(name) {
    return this.plugins.findIndex((plugin) => plugin.packageName === name);
  }

  readPlugins() {
    try {
      fs.accessSync(PLUGIN_MODULES_PATH_DEV);
    } catch (dErr) {
      fs.mkdirSync(PLUGIN_MODULES_PATH_DEV);
    }
    const showDevPlugin = mainStore.config.get('setting.showDevPlugin', false);
    const json = JSON.parse(fs.readFileSync(PLUGIN_JSON_PATH, 'utf8'));
    const deps = Object.keys(json.dependencies || {});
    const devDeps = showDevPlugin ? fs.readdirSync(PLUGIN_MODULES_PATH_DEV) : [];
    const filterFn = (isDev = false) => (name) => {
      if (!/^translime-plugin-/.test(name)) {
        return false;
      }
      const pluginPath = resolvePluginPath(name, isDev);
      try {
        fs.accessSync(pluginPath);
        return true;
      } catch (err) {
        return false;
      }
    };
    // 读取插件
    const devModules = devDeps.filter(filterFn(true))
      .map((pluginPath) => readPlugin(resolvePluginPath(pluginPath, true)));
    const modules = deps.filter(filterFn())
      .map((pluginPath) => readPlugin(resolvePluginPath(pluginPath), devModules))
      .filter((plugin) => plugin);

    // 将插件列表保存到 this.plugins 中，并启用在设置在设置为 enabled 的插件
    this.enablePlugins([...modules, ...devModules]);
    return this.plugins;
  }

  enablePlugins(plugins) {
    // eslint-disable-next-line no-restricted-syntax
    for (const plugin of plugins) {
      this.plugins.push(plugin);
      if (plugin.enabled) {
        // eslint-disable-next-line no-await-in-loop
        this.enablePlugin(plugin.packageName, true);
      }
    }
    this.emit('init', this.plugins);
    this.plugins.forEach((plugin) => {
      if (plugin.enabled) {
        processPlugin(plugin);
      }
    });
  }

  enablePlugin(packageName, init = false) {
    let plugin = this.getPlugin(packageName);
    const pluginPath = resolvePluginPath(packageName);
    if (!plugin) {
      plugin = readPlugin(pluginPath, this.getPlugins().filter((p) => p.dev));
      logger.debug('[plugin] reload plugin: ', { plugin });
    }
    let pluginMain = {};
    if (plugin.exports) {
      try {
        const pluginExports = path.join(plugin.pluginPath, plugin.exports);
        const pluginImport = requireFresh(`${pluginExports}`);
        pluginMain = {
          pluginDidLoad: pluginImport.pluginDidLoad,
          pluginWillUnload: pluginImport.pluginWillUnload,
          pluginSettingSaved: pluginImport.pluginSettingSaved,
          settingMenu: pluginImport.settingMenu,
          pluginMenu: pluginImport.pluginMenu,
          ipcHandlers: pluginImport.ipcHandlers,
          libs: pluginImport.libs,
          windowOptions: pluginImport.windowOptions,
        };
      } catch (err) {
        // todo: handle error
        logger.error('[plugin] enable error: ', err);
      }
    }
    pluginMain.enabled = true;
    mainStore.config.set(`plugin.${plugin.packageName}.enabled`, true);
    const mergedPlugin = Object.assign(plugin, pluginMain || {});
    if (mergedPlugin.ipcHandlers && mergedPlugin.ipcHandlers.length) {
      mergedPlugin.ipcHandlers.forEach((handler) => {
        mainStore.ipc().appendHandler(`${handler.type}@${mergedPlugin.packageName}`, handler.handler);
      });
    }
    mergedPlugin.windowOptions = {};
    if (mergedPlugin.windowUrl) {
      mergedPlugin.windowMode = true;
      mergedPlugin.windowOptions = pluginMain.windowOptions || {};
    } else if (typeof mergedPlugin.windowMode === 'undefined') {
      mergedPlugin.windowMode = mainStore.config.get(`plugin.${plugin.packageName}.windowMode`, false);
    }
    if (!init) {
      processPlugin(mergedPlugin);
    }

    return mergedPlugin;
  }

  disablePlugin(packageName, isUninstall = false) {
    const plugin = this.getPlugin(packageName) || {};
    Object.assign(plugin, {
      enabled: false,
    });
    // 移除 ipc
    if (plugin.ipcHandlers && plugin.ipcHandlers.length) {
      plugin.ipcHandlers.forEach((handler) => {
        mainStore.ipc().removeHandler(`${handler.type}@${plugin.packageName}`);
      });
    }
    // 调用插件卸载方法
    if (typeof plugin.pluginWillUnload === 'function') {
      plugin.pluginWillUnload();
    }
    // 关闭插件窗口
    if (mainStore.getChildWin(`plugin-window-${packageName}`)) {
      mainStore.getChildWin(`plugin-window-${packageName}`).close();
    }
    // 删除 require 缓存
    const findCacheIndex = Object.keys(requireFresh.cache).findIndex((k) => k.includes(`${path.sep}${plugin.packageName}${path.sep}`));
    const cacheKey = findCacheIndex > -1 ? Object.keys(requireFresh.cache)[findCacheIndex] : null;
    if (cacheKey) {
      delete requireFresh.cache[cacheKey];
    } else {
      logger.debug(`[plugin] require 目标缓存: ${path.sep}${plugin.packageName}${path.sep}`);
      logger.debug('[plugin] require 全部缓存: ', { cache: Object.keys(requireFresh.cache) });
    }
    this.plugins.splice(this.plugins.indexOf(plugin), 1);
    if (!isUninstall) {
      const p = readPlugin(plugin.pluginPath, [packageName]);
      p.enabled = false;
      this.plugins.push(p);
      mainStore.config.set(`plugin.${plugin.packageName}.enabled`, false);
    }
  }

  doInstallCommand(packageName, module) {
    return new Promise(async (resolve, reject) => {
      const result = await execNpmCommand('install', module);
      if (result.code) {
        reject(new Error(result.data));
        return;
      }
      try {
        // 启用新插件并加入到 this.plugins
        const plugin = this.enablePlugin(packageName);
        this.plugins.push(plugin);
      } catch (err) {
        reject(err);
        return;
      }
      resolve(result.data);
    });
  }

  async installPlugin(packageName, version) {
    if (!/^translime-plugin-/.test(packageName)) {
      return Promise.reject(new Error('该包不是这个软件的插件'));
    }
    const prevPlugin = this.getPlugin(packageName);
    const module = version ? `${packageName}@${version}` : packageName;
    if (prevPlugin) {
      try {
        await this.uninstallPlugin(packageName);
      } catch (err) {
        return Promise.reject(err);
      }
    }
    return this.doInstallCommand(packageName, module);
  }

  async installLocalPlugin(file) {
    // file 复制到 package 目录内，然后进行安装
    const fileParsed = path.parse(file);
    const pluginPackagePath = path.join(PLUGIN_PACKAGE_DIR, fileParsed.base);
    try {
      await fs.copyFileSync(file, pluginPackagePath);
    } catch (err) {
      return Promise.reject(err);
    }

    const pluginPackageInfo = await readPluginPackageInfo(pluginPackagePath);

    const packageName = pluginPackageInfo.name;
    if (!/^translime-plugin-/.test(packageName)) {
      return Promise.reject(new Error('该包不是这个软件的插件'));
    }
    const prevPlugin = this.getPlugin(packageName);
    const module = pluginPackagePath;
    if (prevPlugin) {
      try {
        await this.uninstallPlugin(packageName);
      } catch (err) {
        return Promise.reject(err);
      }
    }

    // return Promise.resolve(pluginPackageInfo);
    return this.doInstallCommand(packageName, module);
  }

  uninstallPlugin(packageName) {
    return new Promise(async (resolve, reject) => {
      this.disablePlugin(packageName, true);
      const result = await execNpmCommand('uninstall', packageName);
      if (!result.code) {
        resolve(result.data);
      } else {
        reject(new Error(result.data));
      }
    });
  }

  popPluginMenu(packageName, ipcEv) {
    const plugin = this.getPlugin(packageName);
    const self = this;

    // 注册菜单
    const contextMenuItems = [
      {
        id: 'disable-plugin',
        label: '禁用插件',
        visible: plugin.enabled,
        click() {
          self.disablePlugin(packageName);
          ipcEv.sendToClient(ipcType.PLUGINS_CHANGED);
        },
      },
      {
        id: 'enable-plugin',
        label: '启用插件',
        visible: !plugin.enabled,
        click() {
          self.enablePlugin(packageName);
          ipcEv.sendToClient(ipcType.PLUGINS_CHANGED);
        },
      },
      {
        id: 'uninstall-plugin',
        label: '卸载插件',
        click() {
          self.uninstallPlugin(packageName).then(() => {
            ipcEv.sendToClient(ipcType.PLUGINS_CHANGED);
          });
        },
      },
      {
        id: 'open-plugin-setting-panel',
        label: '设置',
        visible: (plugin.enabled && !!plugin.settingMenu && !!plugin.settingMenu.length),
        click() {
          ipcEv.sendToClient(ipcType.OPEN_PLUGIN_SETTING_PANEL, {
            packageName,
          });
        },
      },
      {
        id: 'switch-plugin-window-mode',
        label: '新窗口打开插件',
        type: 'checkbox',
        checked: plugin.windowMode,
        visible: (!!plugin.ui && !plugin.windowUrl),
        click() {
          plugin.windowMode = !plugin.windowMode;
          mainStore.config.set(`plugin.${packageName}.windowMode`, plugin.windowMode);
          if (!plugin.windowMode && mainStore.getChildWin(`plugin-window-${packageName}`)) {
            mainStore.getChildWin(`plugin-window-${packageName}`).close();
          }
          ipcEv.sendToClient(ipcType.PLUGINS_CHANGED);
        },
      },
      {
        id: 'copy-plugin-link',
        label: '复制分享链接',
        click() {
          clipboard.writeText(`https://slime7.github.io/translime/open/?install=${packageName}`);
          ipcEv.sendToClient(ipcType.IPC_TOAST, ['链接已复制']);
        },
      },
    ];
    const menuDivider = {
      type: 'separator',
    };
    if (Array.isArray(plugin.pluginMenu) && plugin.pluginMenu.length) {
      contextMenuItems.push(menuDivider, ...plugin.pluginMenu);
    }

    const menu = Menu.buildFromTemplate(contextMenuItems);
    menu.popup();
  }

  appClose() {
    this.plugins.forEach((plugin) => {
      if (typeof plugin.pluginWillUnload === 'function') {
        plugin.pluginWillUnload();
      }
    });
  }

  access(pluginId) {
    const plugin = this.getPlugin(pluginId);
    return plugin.lib;
  }

  onPluginSettingSave(pluginId) {
    const plugin = this.getPlugin(pluginId);
    if (plugin && typeof plugin.pluginSettingSaved === 'function') {
      plugin.pluginSettingSaved();
    }
  }
}

const pluginLoader = new PluginLoader();
pluginLoader.init();
export default pluginLoader;
