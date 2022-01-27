import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import EventEmitter from 'events';
import spawn from 'cross-spawn';
import createWindow from '@pkg/main/utils/createWindow';

const APPDATA_PATH = app.getPath('userData');
const PLUGIN_DIR = path.join(APPDATA_PATH, 'plugins');
const PLUGIN_JSON_PATH = path.join(PLUGIN_DIR, 'package.json');
const PLUGIN_MODULES_PATH = path.join(PLUGIN_DIR, 'node_modules');

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
      const ext = path.extname(imgPath).toLowerCase();
      plugin.icon = `data:${mimeTypes[ext]};base64, ${fs.readFileSync(imgPath, { encoding: 'base64' })}`;
    } catch (err) {
      plugin.icon = null;
    }
  } else {
    plugin.icon = null;
  }
  plugin.pluginPath = pluginPath;
  plugin.version = pluginPkg.version;
  plugin.enabled = global.store.get(`plugin.${plugin.packageName}.enabled`, true);

  return plugin;
};

const execCommand = (cmd, module, options = {}) => {
  const args = [
    cmd,
    module,
    '--save',
  ];
  if (options.registry) {
    args.push(`--registry=${options.registry}`);
  }
  if (options.proxy) {
    args.push(`--proxy=${options.proxy}`);
  }
  return new Promise((resolve) => {
    const npm = spawn('npm', args, {
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
  if (plugin.windowMode && plugin.main) {
    const pluginPackageName = plugin.title;
    const mainWinBound = global.win.getBounds();
    global.childWins[pluginPackageName] = createWindow('child-window.html', {
      x: mainWinBound.x + 10,
      y: mainWinBound.y + 10,
      width: mainWinBound.width,
      height: mainWinBound.height,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    global.childWins[pluginPackageName].once('ready-to-show', () => {
      global.childWins[pluginPackageName].setTitle(plugin.title);
    });

    global.childWins[pluginPackageName].on('closed', () => {
      delete global.childWins[pluginPackageName];
    });
  }

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

  async getPlugins() {
    if (!this.plugins.length) {
      await this.readPlugins();
    }
    return this.plugins;
  }

  getPlugin(name) {
    return this.plugins.find((plugin) => plugin.packageName === name);
  }

  async readPlugins() {
    const json = JSON.parse(fs.readFileSync(PLUGIN_JSON_PATH, 'utf8'));
    const deps = Object.keys(json.dependencies || {});
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

    await this.enablePlugins(modules);
    return this.plugins;
  }

  async enablePlugins(plugins) {
    // eslint-disable-next-line no-restricted-syntax
    for (const plugin of plugins) {
      this.plugins.push(plugin);
      if (plugin.enabled) {
        // eslint-disable-next-line no-await-in-loop
        await this.enablePlugin(plugin.packageName);
      }
    }
  }

  async enablePlugin(packageName) {
    const plugin = this.getPlugin(packageName);
    let pluginMain;
    try {
      pluginMain = await import(plugin.pluginPath);
      pluginMain.enabled = true;
      global.store.set(`plugin.${plugin.packageName}.enabled`, true);
    } catch (err) {
      // todo: handle error
    }
    const mergedPlugin = Object.assign(plugin, pluginMain || {});
    processPlugin(mergedPlugin);

    return mergedPlugin;
  }

  disablePlugin(packageName, isUninstall = false) {
    const plugin = this.getPlugin(packageName) || {};
    Object.assign(plugin, {
      enabled: false,
    });
    if (!isUninstall) {
      global.store.set(`plugin.${plugin.packageName}.enabled`, false);
    }
    if (typeof plugin.pluginWillUnload === 'function') {
      plugin.pluginWillUnload();
    }
    if (global.childWins[packageName]) {
      global.childWins[packageName].close();
    }
  }

  installPlugin(packageName, version) {
    const module = version ? `${packageName}@${version}` : packageName;
    return new Promise(async (resolve, reject) => {
      const result = await execCommand('install', module);
      if (!result.code) {
        resolve(result.data);
      } else {
        reject(new Error(result.data));
      }
      try {
        const plugin = await this.enablePlugin(packageName);
        this.plugins.push(plugin);
      } catch (err) {
        reject(err);
      }
    });
  }

  uninstallPlugin(packageName) {
    return new Promise((resolve, reject) => {
      this.disablePlugin(packageName, true);
      const result = execCommand('uninstall', packageName);
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
