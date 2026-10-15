import { defineIpcHandlers, useLogger, usePluginConfig } from 'translime-sdk';
import * as adbModule from './src/adb';
import * as scrcpyModule from './src/scrcpy';
import * as wirelessModule from './src/wireless';
import { resolveAdbPath, resolveScrcpyPath } from './src/bin-resolver';

const id = 'translime-plugin-scrcpy-wrapper';
const baseLogger = useLogger();
const logger = baseLogger.child ? baseLogger.child({ plugin_id: id, context: 'Main' }) : baseLogger;

const pluginConfig = usePluginConfig(id);
const WIRELESS_DEVICES_KEY = 'wirelessDevices';

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

/**
 * 已配对保存的无线设备列表，元素为 { serial, model }，serial 为 `IP:端口`
 */
const getStoredWirelessDevices = () => {
  const raw = pluginConfig.get(WIRELESS_DEVICES_KEY, []);
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => ({
      serial: String(item?.serial ?? ''),
      model: String(item?.model ?? ''),
    }))
    .filter((item) => wirelessModule.isWirelessSerial(item.serial));
};

const saveStoredWirelessDevices = (list) => {
  pluginConfig.set(WIRELESS_DEVICES_KEY, list);
};

const listMergedDevices = async () => {
  const devices = await adbModule.listDevices(getAdbPath());
  return wirelessModule.mergeWirelessDevices(devices, getStoredWirelessDevices());
};

/**
 * 连接成功后把设备存入设置：同一 IP 的旧条目端口已过期，保存时一并清理
 */
const storeWirelessConnection = async (serial) => {
  const devices = await adbModule.listDevices(getAdbPath()).catch(() => []);
  const model = devices.find((device) => device.serial === serial)?.model ?? '';
  const remaining = getStoredWirelessDevices()
    .filter((item) => wirelessModule.parseAddress(item.serial)?.ip !== wirelessModule.parseAddress(serial)?.ip);
  const stored = [...remaining, { serial, model }];
  saveStoredWirelessDevices(stored);
  logger.info(`[${id}] wireless device stored: ${serial}`);
  return { success: true, serial, devices: wirelessModule.mergeWirelessDevices(devices, stored) };
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
        const devices = await listMergedDevices();
        return { success: true, devices };
      } catch (e) {
        return { success: false, message: `获取设备列表失败: ${e.message}` };
      }
    },
  },
  {
    type: 'pair-wireless',
    handler: () => async ({ address, pairingCode }) => {
      const parsed = wirelessModule.parseAddress(address);
      if (!parsed) {
        return { success: false, message: '地址无效，请填写手机配对页面显示的 IP:端口' };
      }
      if (!/^\d{6}$/.test(String(pairingCode ?? '').trim())) {
        return { success: false, message: '配对码应为 6 位数字' };
      }
      const adbPath = getAdbPath();
      const knownSerials = (await adbModule.listDevices(adbPath).catch(() => []))
        .map((device) => device.serial);
      try {
        await adbModule.pairDevice(adbPath, wirelessModule.formatAddress(parsed), pairingCode.trim());
      } catch (e) {
        return { success: false, message: `配对失败：${e.message}` };
      }
      // 配对成功后识别新上线设备（新版 adb 会自动回连），必要时用 mDNS 主动连接
      const connected = await wirelessModule.connectAfterPairing({
        adbPath,
        adb: adbModule,
        knownSerials,
        ip: parsed.ip,
      });
      if (!connected.ok) {
        return { success: false, message: `配对成功，但连接失败：${connected.message}` };
      }
      return storeWirelessConnection(connected.serial);
    },
  },
  {
    type: 'remove-wireless',
    handler: () => async ({ serial }) => {
      const stored = getStoredWirelessDevices().filter((item) => item.serial !== serial);
      saveStoredWirelessDevices(stored);
      try {
        return { success: true, devices: await listMergedDevices() };
      } catch (e) {
        return { success: false, message: `已移除，但刷新设备列表失败: ${e.message}` };
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
        let actualSerial = serial;
        if (wirelessModule.isWirelessSerial(actualSerial)) {
          const ensured = await wirelessModule.ensureWirelessConnected({
            serial: actualSerial,
            adbPath: getAdbPath(),
            adb: adbModule,
          });
          if (!ensured.ok) {
            return { success: false, message: ensured.message };
          }
          if (ensured.portChanged) {
            const stored = getStoredWirelessDevices();
            const entry = stored.find((item) => item.serial === serial);
            if (entry) {
              saveStoredWirelessDevices(stored.map((item) => (
                item.serial === serial ? { ...item, serial: ensured.serial } : item
              )));
              logger.info(`[${id}] wireless port updated: ${serial} -> ${ensured.serial}`);
            }
          }
          actualSerial = ensured.serial;
        }
        const result = await scrcpyModule.launchSession({
          mode,
          serial: actualSerial,
          pkg,
          settingValue: getScrcpySetting(),
          logger,
        });
        return { success: true, serial: actualSerial, ...result };
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
