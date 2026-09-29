/* eslint-disable no-console */
/**
 * 隔离插件子进程引导脚本。
 *
 * 该文件运行在 Electron utilityProcess（纯 Node.js 环境，无 Electron API）中，
 * 负责加载插件入口、执行生命周期，并通过 `process.parentPort` 与宿主
 * `isolatedRuntime.js` 通信。协议见 isolatedRuntime.js 顶部说明。
 *
 * 注意：本文件必须保持零依赖（仅 Node 内置模块），
 * 不能 require 任何依赖 Electron 的模块。
 */

const ALLOWED_LOG_LEVELS = ['error', 'warn', 'info', 'verbose', 'debug', 'silly'];

const { parentPort } = process;

const postMessage = (message) => {
  parentPort.postMessage(message);
};

const forwardLog = (level, args) => {
  postMessage({
    channel: 'log',
    level: ALLOWED_LOG_LEVELS.includes(level) ? level : 'info',
    args,
  });
};

// 转发 console 输出，让插件（包括打包了旧版 SDK 的插件）的日志仍进入宿主 winston
['log', 'info', 'warn', 'error', 'debug'].forEach((level) => {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    original(...args);
    forwardLog(level === 'log' ? 'debug' : level, args);
  };
});

/**
 * 与 runtime.js 的 normalizeRuntimeCommands 保持一致的命令归一化。
 *
 * @param {Array<object>|Record<string, Function>|undefined|null} commands - 命令定义。
 * @returns {Array<{id: string, handler: Function}>} 归一化命令列表。
 */
const normalizeRuntimeCommands = (commands) => {
  if (!commands) {
    return [];
  }
  if (Array.isArray(commands)) {
    return commands
      .filter((command) => command && command.id && typeof command.handler === 'function')
      .map((command) => ({ id: String(command.id), handler: command.handler }));
  }
  if (typeof commands === 'object') {
    return Object.entries(commands)
      .filter(([, handler]) => typeof handler === 'function')
      .map(([id, handler]) => ({ id, handler }));
  }
  return [];
};

const state = {
  entryExports: null,
  handlers: new Map(),
  commands: new Map(),
  registered: false,
};

const buildIpcContext = () => ({
  sendToClient: (type, data, target = null) => postMessage({
    channel: 'send-to-client',
    type,
    data,
    target: target === 'all' ? 'all' : null,
  }),
  sendToMain: (type, data) => postMessage({
    channel: 'send-to-client',
    type,
    data,
    target: null,
  }),
  sendToAllWindows: (type, data) => postMessage({
    channel: 'send-to-client',
    type,
    data,
    target: 'all',
  }),
});

const registerCapabilities = () => {
  const pluginExports = state.entryExports;
  if (typeof pluginExports.libs !== 'undefined' && pluginExports.libs !== null) {
    forwardLog('warn', ['隔离模式暂不支持 libs 导出（跨进程无法透传对象引用），已忽略']);
  }

  state.handlers = new Map();
  const ipcTypes = [];
  (Array.isArray(pluginExports.ipcHandlers) ? pluginExports.ipcHandlers : []).forEach((handler) => {
    if (!handler || !handler.type || typeof handler.handler !== 'function') {
      return;
    }
    const realHandler = handler.handler(buildIpcContext());
    if (typeof realHandler !== 'function') {
      return;
    }
    state.handlers.set(String(handler.type), realHandler);
    ipcTypes.push(String(handler.type));
  });

  state.commands = new Map();
  const commandIds = [];
  normalizeRuntimeCommands(pluginExports.commands).forEach((command) => {
    state.commands.set(command.id, command.handler);
    commandIds.push(command.id);
  });

  state.registered = true;
  postMessage({
    channel: 'register',
    ipcTypes,
    commands: commandIds,
    hasLibs: Boolean(pluginExports.libs),
  });
};

const safeInvoke = async (fn, args) => {
  try {
    return { data: await fn(...args), err: null };
  } catch (err) {
    return { data: null, err: err instanceof Error ? err.message : String(err) };
  }
};

parentPort.on('message', async (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') {
    return;
  }

  switch (message.channel) {
  case 'activate': {
    try {
      // eslint-disable-next-line import-x/no-dynamic-require
      state.entryExports = require(process.env.TRANSLIME_PLUGIN_ENTRY);
    } catch (err) {
      postMessage({
        channel: 'load-error',
        error: `插件入口加载失败：${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    if (typeof state.entryExports.pluginDidLoad === 'function') {
      try {
        state.entryExports.pluginDidLoad();
      } catch (err) {
        postMessage({
          channel: 'load-error',
          error: `pluginDidLoad 执行失败：${err instanceof Error ? err.message : String(err)}`,
        });
        return;
      }
    }
    registerCapabilities();
    break;
  }
  case 'ipc-invoke': {
    const handler = state.handlers.get(String(message.type));
    if (!handler) {
      postMessage({
        channel: 'ipc-result', reqId: message.reqId, data: null, err: `IPC handler [${message.type}] not found`,
      });
      break;
    }
    const result = await safeInvoke(handler, message.args || []);
    postMessage({ channel: 'ipc-result', reqId: message.reqId, ...result });
    break;
  }
  case 'command-invoke': {
    const handler = state.commands.get(String(message.id));
    if (!handler) {
      postMessage({
        channel: 'command-result', reqId: message.reqId, data: null, err: `命令 "${message.id}" 没有可执行的处理函数`,
      });
      break;
    }
    const result = await safeInvoke(handler, message.args || []);
    postMessage({ channel: 'command-result', reqId: message.reqId, ...result });
    break;
  }
  case 'setting-saved': {
    if (typeof state.entryExports?.pluginSettingSaved === 'function') {
      try {
        state.entryExports.pluginSettingSaved();
      } catch (err) {
        forwardLog('error', [`pluginSettingSaved 执行失败：${err instanceof Error ? err.message : String(err)}`]);
      }
    }
    break;
  }
  case 'unload': {
    if (typeof state.entryExports?.pluginWillUnload === 'function') {
      try {
        state.entryExports.pluginWillUnload();
      } catch (err) {
        forwardLog('error', [`pluginWillUnload 执行失败：${err instanceof Error ? err.message : String(err)}`]);
      }
    }
    postMessage({ channel: 'unloaded' });
    break;
  }
  default:
    break;
  }
});

postMessage({ channel: 'ready' });
