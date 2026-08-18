#!/usr/bin/env node

import { build, createLogger, createServer } from 'vite';
import electronPath from 'electron';
import { spawn } from 'node:child_process';
import waitOn from 'wait-on';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const dir = dirname(filename);

/**
 * @typedef {'production' | 'development' | 'test'} BuildMode
 * @type {BuildMode}
 */
// eslint-disable-next-line no-multi-assign
const mode = (process.env.MODE = process.env.MODE || 'development');
const DEFAULT_CDP_PORT = 9222;

const getCdpPort = () => {
  const cdpArgument = process.argv.find((argument) => (
    argument === '--cdp' || argument.startsWith('--cdp-port=')
  ));

  if (!cdpArgument) {
    return null;
  }

  if (cdpArgument === '--cdp') {
    return DEFAULT_CDP_PORT;
  }

  const port = Number(cdpArgument.substring('--cdp-port='.length));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid CDP port: ${cdpArgument}`);
  }

  return port;
};

const CDP_PORT = getCdpPort();

/** @type {import('vite').LogLevel} */
const LOG_LEVEL = 'info';

// 需要过滤的错误模式
const STDERR_FILTER_PATTERNS = [
  // 关于devtools扩展的警告
  // https://github.com/cawa-93/vite-electron-builder/issues/492
  // https://github.com/MarshallOfSound/electron-devtools-installer/issues/143
  /ExtensionLoadWarning/,
];

let manualRestart = false;
let electronProcess = null;

/**
 * 共享的Vite配置
 * @type {import('vite').InlineConfig}
 */
const sharedConfig = {
  mode,
  build: { watch: {} },
  logLevel: LOG_LEVEL,
};

/**
 * 启动Electron进程
 * @param {import('vite').Logger} logger - Vite日志记录器
 */
const startElectronProcess = (logger) => {
  if (electronProcess !== null) {
    manualRestart = true;
    electronProcess.kill('SIGINT');
    electronProcess = null;
    logger.warn('Electron app restarted', { timestamp: true });
  }

  const electronArguments = ['--inspect=5858'];
  if (CDP_PORT) {
    electronArguments.push(`--remote-debugging-port=${CDP_PORT}`);
    logger.info(`Electron CDP enabled at http://127.0.0.1:${CDP_PORT}`);
  }
  electronArguments.push('.');

  electronProcess = spawn(String(electronPath), electronArguments);

  // 处理标准输出
  electronProcess.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) logger.warn(output, { timestamp: true });
  });

  // 处理标准错误输出
  electronProcess.stderr.on('data', (data) => {
    const error = data.toString().trim();
    if (!error) return;

    const shouldIgnore = STDERR_FILTER_PATTERNS.some((pattern) => pattern.test(error));
    if (!shouldIgnore) logger.error(error, { timestamp: true });
  });

  // 处理进程退出
  electronProcess.on('exit', (code, signal) => {
    if (!manualRestart && !signal) {
      process.exit(code || 0);
    } else {
      manualRestart = false;
    }
  });
};

/**
 * 设置主进程文件监听器
 * @param {import('vite').ViteDevServer} viteDevServer
 * @returns {Promise<import('vite').RollupOutput | Array<import('vite').RollupOutput> | import('vite').RollupWatcher>}
 */
const setupMainProcessWatcher = (viteDevServer) => {
  // 设置开发服务器URL环境变量
  const protocol = `http${viteDevServer.config.server.https ? 's' : ''}:`;
  const host = viteDevServer.config.server.host || 'localhost';
  const { port } = viteDevServer.config.server;
  process.env.VITE_DEV_SERVER_URL = `${protocol}//${host}:${port}/`;

  const logger = createLogger(LOG_LEVEL, { prefix: '[main]' });

  return build({
    ...sharedConfig,
    configFile: 'src/vite.main.config.js',
    plugins: [{
      name: 'reload-app-on-main-package-change',
      writeBundle: () => startElectronProcess(logger),
    }],
  });
};

/**
 * 设置预加载文件监听器
 * @param {import('vite').ViteDevServer} viteDevServer
 * @returns {Promise<import('vite').RollupOutput | Array<import('vite').RollupOutput> | import('vite').RollupWatcher>}
 */
const setupPreloadWatcher = (viteDevServer) => build({
  ...sharedConfig,
  configFile: 'src/vite.preload.config.js',
  plugins: [{
    name: 'reload-page-on-preload-package-change',
    writeBundle: () => viteDevServer.ws.send({ type: 'full-reload' }),
  }],
});

/**
 * 启动Vite开发服务器
 * @returns {Promise<import('vite').ViteDevServer>}
 */
const startDevServer = async () => {
  const server = await createServer({
    ...sharedConfig,
    configFile: 'src/vite.renderer.config.js',
  });
  await server.listen();
  return server;
};

/**
 * 启动开发环境
 * @returns {Promise<void>}
 */
const startDevEnvironment = async () => {
  try {
    const viteDevServer = await startDevServer();

    const protocol = `http${viteDevServer.config.server.https ? 's' : ''}:`;
    const host = viteDevServer.config.server.host || 'localhost';
    const { port } = viteDevServer.config.server;
    const serverUrl = `${protocol}//${host}:${port}/`;

    await waitOn({
      resources: [serverUrl],
      timeout: 10000,
    });

    await setupPreloadWatcher(viteDevServer);
    await waitOn({
      resources: [join(dir, '../dist/preload/index.cjs')],
      timeout: 5000,
    });

    await setupMainProcessWatcher(viteDevServer);
  } catch (error) {
    console.error('Development server error:', error);
    if (electronProcess !== null) {
      electronProcess.kill('SIGINT');
      electronProcess = null;
    }
    process.exit(1);
  }
};

// 启动开发环境
startDevEnvironment();
