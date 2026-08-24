import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 将 Mock 日志文件注入到目标 userData 目录下的 logs 文件夹中
 * @param {string} userDataDir - 目标应用的临时 userData 绝对路径
 * @returns {void}
 */
export const injectMockLogs = (userDataDir) => {
  const logsSourceDir = path.join(dirname, 'logs');
  const targetLogsDir = path.join(userDataDir, 'logs');

  if (!fs.existsSync(targetLogsDir)) {
    fs.mkdirSync(targetLogsDir, { recursive: true });
  }

  if (fs.existsSync(logsSourceDir)) {
    const files = fs.readdirSync(logsSourceDir);
    files.forEach((file) => {
      const srcFile = path.join(logsSourceDir, file);
      const destFile = path.join(targetLogsDir, file);
      fs.copyFileSync(srcFile, destFile);
    });
  }
};

/**
 * 将 Mock 插件复制并注入到目标 userData 目录下的 plugins 模块中
 * @param {string} userDataDir - 目标应用的临时 userData 绝对路径
 * @returns {void}
 */
export const injectMockPlugins = (userDataDir) => {
  const pluginsSourceDir = path.join(dirname, 'plugins');
  const targetPluginsDir = path.join(userDataDir, 'plugins');
  const targetNodeModulesDir = path.join(targetPluginsDir, 'node_modules');

  if (!fs.existsSync(targetNodeModulesDir)) {
    fs.mkdirSync(targetNodeModulesDir, { recursive: true });
  }

  // 写入 plugins/package.json 声明已安装插件
  const pluginManifest = {
    name: 'translime-plugins-runtime',
    private: true,
    dependencies: {
      'translime-plugin-mock-test': '1.0.0',
    },
  };
  fs.writeFileSync(
    path.join(targetPluginsDir, 'package.json'),
    JSON.stringify(pluginManifest, null, 2),
    'utf8',
  );

  // 复制 mock 插件内容
  if (fs.existsSync(pluginsSourceDir)) {
    const pluginFolders = fs.readdirSync(pluginsSourceDir);
    pluginFolders.forEach((folder) => {
      const srcPlugin = path.join(pluginsSourceDir, folder);
      const destPlugin = path.join(targetNodeModulesDir, folder);
      if (fs.statSync(srcPlugin).isDirectory()) {
        fs.cpSync(srcPlugin, destPlugin, { recursive: true });
      }
    });
  }
};

/**
 * 注入自定义应用配置（写入 config.json）
 * @param {string} userDataDir - 目标应用的临时 userData 绝对路径
 * @param {object} [initialConfig={}] - 初始配置对象
 * @returns {void}
 */
export const injectMockConfig = (userDataDir, initialConfig = {}) => {
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const defaultConfig = {
    window: {
      x: 100,
      y: 100,
      width: 900,
      height: 600,
      maximize: false,
    },
    setting: {
      theme: 'system',
      minimizeToTrayOnClose: false,
      autoUpdate: false,
    },
    ...initialConfig,
  };

  fs.writeFileSync(
    path.join(userDataDir, 'config.json'),
    JSON.stringify(defaultConfig, null, 2),
    'utf8',
  );
};

/**
 * 一键注入全量 Mock 数据（日志、插件、配置）
 * @param {string} userDataDir - 目标应用的临时 userData 绝对路径
 * @param {object} [options={}] - 注入选项
 * @returns {void}
 */
export const injectAllMocks = (userDataDir, options = {}) => {
  injectMockConfig(userDataDir, options.config);
  injectMockLogs(userDataDir);
  injectMockPlugins(userDataDir);
};
