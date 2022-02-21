import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import EventEmitter from 'events';
import spawn from 'cross-spawn';
import { createRequire } from 'module';

const requireFresh = createRequire(import.meta.url);
const APPDATA_PATH = app.getPath('userData');
const PLUGIN_DIR = path.join(APPDATA_PATH, 'plugins');
const PLUGIN_JSON_PATH = path.join(PLUGIN_DIR, 'package.json');
const PLUGIN_MODULES_PATH = path.join(PLUGIN_DIR, 'node_modules');
const NPM_EXEC_PATH = path.join(global.ROOT, 'node_modules', 'npm', 'bin', 'npm-cli.js');

const resolvePluginPath = (pluginName) => path.join(PLUGIN_MODULES_PATH, pluginName);

const readPlugin = (pluginPath) => {
  const pluginPkg = JSON.parse(fs.readFileSync(path.join(pluginPath, 'package.json'), 'utf8'));
  const plugin = pluginPkg.plugin || {};
  plugin.packageName = pluginPkg.name;
  if (!plugin.title) {
    plugin.title = pluginPkg.name;
  }
  if (!plugin.author) {
    plugin.author = pluginPkg.author || 'unknown';
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
    plugin.windowUrl = path.resolve(pluginPath, plugin.windowUrl);
  }
  if (plugin.ui) {
    plugin.ui = path.resolve(pluginPath, plugin.ui);
  }
  plugin.exports = pluginPkg.main;
  if (pluginPkg.exports) {
    if (pluginPkg.exports['.'] && pluginPkg.exports['.'].require) {
      plugin.exports = pluginPkg.exports['.'].require;
    }
  }
  plugin.pluginPath = pluginPath;
  plugin.version = pluginPkg.version;
  plugin.enabled = global.store.get(`plugin.${plugin.packageName}.enabled`, true);

  return plugin;
};

const execNpmCommand = (cmd, module, options = {}) => {
  const internalOptions = {
    ...{
      registry: global.store.get('pluginManager.registry', 'https://registry.npmmirror.com/'),
    },
    ...options,
  };
  const args = [
    cmd,
    module,
    '--save',
  ];
  if (cmd === 'install') {
    args.push(...[
      '--no-progress',
      '--no-prune',
      '--global-style',
      '--ignore-scripts',
      '--legacy-peer-deps',
    ]);
  }
  if (cmd === 'uninstall') {
    args.push(...[
      '--no-progress',
    ]);
  }
  if (internalOptions.registry) {
    args.push(`--registry=${internalOptions.registry}`);
  }
  if (internalOptions.proxy) {
    args.push(`--proxy=${internalOptions.proxy}`);
  }
  return new Promise((resolve) => {
    const npm = spawn(NPM_EXEC_PATH, args, {
      cwd: PLUGIN_DIR,
    });

    let output = '';
    npm.stdout.on('data', (data) => {
      output += data;
    }).pipe(process.stdout);

    npm.stderr.on('data', (data) => {
      output += data;
    }).pipe(process.stderr);

    npm.on('close', (code) => {
      if (!code) {
        resolve({ code: 0, data: output });
      } else {
        resolve({ code, data: output });
      }
    });
  });
};

const processPlugin = (plugin) => {
  console.log(plugin);

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
        fs.writeFileSync(PLUGIN_JSON_PATH, JSON.stringify(pkg, null, 2), 'utf8');
      }
    });
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
    const json = JSON.parse(fs.readFileSync(PLUGIN_JSON_PATH, 'utf8'));
    const deps = Object.keys(json.dependencies || {});
    // 读取插件
    const modules = deps.filter((name) => {
      if (!/^translime-plugin-/.test(name)) {
        return false;
      }
      const pluginPath = resolvePluginPath(name);
      try {
        fs.accessSync(pluginPath);
        return true;
      } catch (err) {
        return false;
      }
    })
      .map((pluginPath) => readPlugin(resolvePluginPath(pluginPath)));

    // 将插件列表保存到 this.plugins 中，并启用在设置在设置为 enabled 的插件
    this.enablePlugins(modules);
    return this.plugins;
  }

  enablePlugins(plugins) {
    // eslint-disable-next-line no-restricted-syntax
    for (const plugin of plugins) {
      this.plugins.push(plugin);
      if (plugin.enabled) {
        // eslint-disable-next-line no-await-in-loop
        this.enablePlugin(plugin.packageName);
      }
    }
  }

  enablePlugin(packageName) {
    let plugin = this.getPlugin(packageName);
    const pluginPath = resolvePluginPath(packageName);
    if (!plugin) {
      plugin = readPlugin(pluginPath);
      console.log('reload plugin: ', { ...plugin });
    }
    let pluginMain;
    try {
      const pluginExports = path.join(plugin.pluginPath, plugin.exports);
      pluginMain = requireFresh(`${pluginExports}`);
      pluginMain.enabled = true;
      global.store.set(`plugin.${plugin.packageName}.enabled`, true);
    } catch (err) {
      // todo: handle error
      console.log('plugin enable error: ', err);
    }
    const mergedPlugin = Object.assign(plugin, pluginMain || {});
    if (mergedPlugin.windowUrl) {
      mergedPlugin.windowMode = true;
    } else if (typeof mergedPlugin.windowMode === 'undefined') {
      mergedPlugin.windowMode = global.store.get(`plugin.${plugin.packageName}.windowMode`, false);
    }
    processPlugin(mergedPlugin);

    return mergedPlugin;
  }

  disablePlugin(packageName, isUninstall = false) {
    const plugin = this.getPlugin(packageName) || {};
    Object.assign(plugin, {
      enabled: false,
    });
    if (typeof plugin.pluginWillUnload === 'function') {
      plugin.pluginWillUnload();
    }
    if (global.childWins[`plugin-window-${packageName}`]) {
      global.childWins[`plugin-window-${packageName}`].close();
    }
    // 删除 require 缓存
    delete requireFresh.cache[path.join(plugin.pluginPath, plugin.exports)];
    this.plugins.splice(this.plugins.indexOf(plugin), 1);
    if (!isUninstall) {
      const p = readPlugin(resolvePluginPath(packageName));
      p.enabled = false;
      this.plugins.push(p);
      global.store.set(`plugin.${plugin.packageName}.enabled`, false);
    }
  }

  installPlugin(packageName, version) {
    if (!/^translime-plugin-/.test(packageName)) {
      return Promise.reject(new Error('该包不是这个软件的插件'));
    }
    const module = version ? `${packageName}@${version}` : packageName;
    return new Promise(async (resolve, reject) => {
      const result = await execNpmCommand('install', module);
      if (result.code) {
        reject(new Error(result.data));
      }
      try {
        // 启用新插件并加入到 this.plugins
        const plugin = await this.enablePlugin(packageName);
        this.plugins.push(plugin);
      } catch (err) {
        reject(err);
      }
      resolve(result.data);
    });
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
}

const pluginLoader = new PluginLoader();
pluginLoader.init();
export default pluginLoader;
