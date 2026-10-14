import { defineIpcHandlers, useLogger, usePluginConfig } from 'translime-sdk';
import * as adbModule from './src/adb';
import * as scrcpyModule from './src/scrcpy';
import { resolveAdbPath, resolveScrcpyPath } from './src/bin-resolver';

const id = 'translime-plugin-scrcpy-wrapper';
const baseLogger = useLogger();
const logger = baseLogger.child ? baseLogger.child({ plugin_id: id, context: 'Main' }) : baseLogger;

const pluginConfig = usePluginConfig(id);

const settingMenu = [
  {
    key: 'scrcpyPath',
    type: 'file',
    name: 'scrcpy 路径',
    required: false,
    valueType: 'string',
    placeholder: '留空则使用系统 PATH 中的 scrcpy',
    dialogOptions: {
      filters: [{ name: 'scrcpy', extensions: ['exe'] }],
      properties: ['openFile', 'dontAddToRecent'],
    },
  },
];

const getScrcpySetting = () => pluginConfig.get('scrcpyPath', null);

const getAdbPath = () => {
  const scrcpyInfo = resolveScrcpyPath({ settingValue: getScrcpySetting() });
  return resolveAdbPath({ scrcpyResolved: scrcpyInfo.resolved });
};

const pluginDidLoad = () => {
  logger.info(`[${id}] plugin loaded`);
};

const pluginWillUnload = () => {
  scrcpyModule.closeAllSessions();
};

const ipcHandlers = defineIpcHandlers([
  {
    type: 'list-devices',
    handler: () => async () => {
      try {
        const devices = await adbModule.listDevices(getAdbPath());
        return { success: true, devices };
      } catch (e) {
        return { success: false, message: `获取设备列表失败: ${e.message}` };
      }
    },
  },
  {
    type: 'list-apps',
    handler: () => async (serial) => {
      if (!serial) {
        return { success: false, message: '缺少设备 serial' };
      }
      try {
        const packages = await adbModule.listPackages(getAdbPath(), serial);
        return { success: true, packages };
      } catch (e) {
        return { success: false, message: `获取应用列表失败: ${e.message}` };
      }
    },
  },
  {
    type: 'launch',
    handler: () => async ({ mode, serial, pkg }) => {
      try {
        const result = await scrcpyModule.launchSession({
          mode,
          serial,
          pkg,
          settingValue: getScrcpySetting(),
          logger,
        });
        return { success: true, ...result };
      } catch (e) {
        logger.error(`[${id}] launch failed: ${e.message}`);
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'close-session',
    handler: () => async (sessionId) => ({ success: scrcpyModule.closeSession(sessionId) }),
  },
  {
    type: 'scrcpy-key',
    handler: () => async (sessionId, keycode) => {
      const session = scrcpyModule.getSession(sessionId);
      if (!session) {
        return { success: false, message: '会话不存在或已关闭' };
      }
      try {
        await adbModule.sendKeyEvent(session.adbPath, session.serial, keycode);
        return { success: true };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
]);

export default {
  pluginDidLoad,
  pluginWillUnload,
  settingMenu,
  ipcHandlers,
};
