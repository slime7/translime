import {
  defineIpcHandlers,
  registerDeepLinkHandlers,
  useLogger,
  usePluginConfig,
} from 'translime-sdk';
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

const STORED_DEVICES_KEY = 'storedDevices';
const DEVICE_CONFIGS_KEY = 'deviceConfigs';
const VIRTUAL_SIZE_KEY = 'virtualWindowSize';

const DEFAULT_DEVICE_CONFIG = {
  bitRate: '16M',
  maxFps: 60,
};

/**
 * 已保存的设备列表，元素为 { serial, model, type: 'usb' | 'wireless' }
 * 兼容读取历史版本仅存无线设备的 wirelessDevices
 */
const getStoredDevices = () => {
  const raw = pluginConfig.get(STORED_DEVICES_KEY, null);
  if (Array.isArray(raw)) {
    return raw
      .map((item) => ({
        serial: String(item?.serial ?? ''),
        model: String(item?.model ?? ''),
        type: item?.type === 'usb' ? 'usb' : 'wireless',
      }))
      .filter((item) => item.serial !== '');
  }
  const legacy = pluginConfig.get(WIRELESS_DEVICES_KEY, []);
  if (Array.isArray(legacy)) {
    return legacy
      .map((item) => ({
        serial: String(item?.serial ?? ''),
        model: String(item?.model ?? ''),
        type: 'wireless',
      }))
      .filter((item) => wirelessModule.isWirelessSerial(item.serial));
  }
  return [];
};

const saveStoredDevices = (list) => {
  pluginConfig.set(STORED_DEVICES_KEY, list);
};

const getStoredWirelessDevices = () => getStoredDevices().filter((d) => d.type === 'wireless');

const saveStoredWirelessDevices = (list) => {
  const nonWireless = getStoredDevices().filter((d) => d.type !== 'wireless');
  saveStoredDevices([...nonWireless, ...list.map((d) => ({ ...d, type: 'wireless' }))]);
};

const getDeviceConfig = (serial) => {
  const map = pluginConfig.get(DEVICE_CONFIGS_KEY, {}) || {};
  return { ...DEFAULT_DEVICE_CONFIG, ...(map[serial] || {}) };
};

const saveDeviceConfig = (serial, config) => {
  const map = pluginConfig.get(DEVICE_CONFIGS_KEY, {}) || {};
  map[serial] = { ...getDeviceConfig(serial), ...config };
  pluginConfig.set(DEVICE_CONFIGS_KEY, map);
};

const getSavedVirtualSize = (serial, pkg) => {
  const map = pluginConfig.get(VIRTUAL_SIZE_KEY, {}) || {};
  return map[`${serial}:${pkg}`] || map[pkg] || null;
};

const saveVirtualSize = (serial, pkg, size) => {
  if (size && size.width > 0 && size.height > 0) {
    const map = pluginConfig.get(VIRTUAL_SIZE_KEY, {}) || {};
    map[`${serial}:${pkg}`] = size;
    map[pkg] = size;
    pluginConfig.set(VIRTUAL_SIZE_KEY, map);
  }
};

const MIRROR_SIZE_KEY = 'mirrorWindowSize';
const getSavedMirrorSize = (serial) => {
  const map = pluginConfig.get(MIRROR_SIZE_KEY, {}) || {};
  return map[serial] || map.default || null;
};
const saveMirrorSize = (serial, size) => {
  if (size && size.width > 0 && size.height > 0) {
    const map = pluginConfig.get(MIRROR_SIZE_KEY, {}) || {};
    map[serial] = size;
    map.default = size;
    pluginConfig.set(MIRROR_SIZE_KEY, map);
  }
};

const listMergedDevices = async () => {
  const adbPath = getAdbPath();
  const devices = await adbModule.listDevices(adbPath);
  const devicesWithInfo = await Promise.all(devices.map(async (device) => {
    if (device.state === 'device') {
      const resolution = await adbModule.getDeviceResolution(adbPath, device.serial);
      return { ...device, resolution };
    }
    return device;
  }));
  return wirelessModule.mergeWirelessDevices(devicesWithInfo, getStoredDevices());
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

/**
 * 启动 scrcpy 会话的共用流程：无线设备先确保连接（端口变化时回写存储），
 * 再按模式交给 scrcpy 模块开窗。IPC 的 `launch` 与深链 `mirror` 共用。
 */
const launchDeviceSession = async ({
  mode,
  serial,
  pkg,
  resolution,
}) => {
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
    const devConf = getDeviceConfig(actualSerial);
    const result = await scrcpyModule.launchSession({
      mode,
      serial: actualSerial,
      pkg,
      resolution,
      savedSize: mode === 'mirror' ? getSavedMirrorSize(actualSerial) : null,
      savedVirtualSize: mode === 'virtual' && pkg ? getSavedVirtualSize(actualSerial, pkg) : null,
      onSaveMirrorSize: (size) => saveMirrorSize(actualSerial, size),
      onSaveVirtualSize: (size) => {
        if (pkg) {
          saveVirtualSize(actualSerial, pkg, size);
        }
      },
      bitRate: devConf.bitRate,
      maxFps: devConf.maxFps,
      settingValue: getScrcpySetting(),
      logger,
    });
    return { success: true, serial: actualSerial, ...result };
  } catch (e) {
    logger.error(`[${id}] launch failed: ${e.message}`);
    return { success: false, message: e.message };
  }
};

/**
 * 深链 `translime://plugin/scrcpy-wrapper/mirror[?serial=xxx]`：
 * 未指定 serial 时取第一台在线设备，直接弹出整屏镜像窗口。
 */
const launchMirrorFromDeepLink = async ({ path, params }) => {
  let serial = String(params?.serial ?? '').trim();
  if (!serial) {
    const devices = await adbModule.listDevices(getAdbPath()).catch(() => []);
    serial = devices.find((device) => device.state === 'device')?.serial ?? '';
  }
  if (!serial) {
    logger.warn(`[${id}] deep link ${path}: 无在线设备，忽略`);
    return;
  }
  const result = await launchDeviceSession({ mode: 'mirror', serial });
  if (!result.success) {
    logger.warn(`[${id}] deep link mirror 失败: ${result.message}`);
  }
};

const pluginDidLoad = () => {
  logger.info(`[${id}] plugin loaded`);
  registerDeepLinkHandlers(id, {
    mirror: (event) => {
      launchMirrorFromDeepLink(event).catch((e) => {
        logger.error(`[${id}] deep link mirror 异常: ${e.message}`);
      });
    },
  });
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
        return { success: false, message: '地址无效，请填写手机无线调试页面显示的 IP:端口' };
      }
      const pairingCodeValue = String(pairingCode ?? '').trim();
      const adbPath = getAdbPath();
      // 配对码留空：设备应已与本机配对，跳过配对直接连接
      if (!pairingCodeValue) {
        const ensured = await wirelessModule.ensureWirelessConnected({
          serial: wirelessModule.formatAddress(parsed),
          adbPath,
          adb: adbModule,
        });
        if (!ensured.ok) {
          return {
            success: false,
            message: ensured.authError
              ? '设备未与本机配对或配对已失效，请填写配对码重新配对'
              : `连接失败：${ensured.message}`,
          };
        }
        return storeWirelessConnection(ensured.serial);
      }
      if (!/^\d{6}$/.test(pairingCodeValue)) {
        return { success: false, message: '配对码应为 6 位数字；已配对设备可将配对码留空直接连接' };
      }
      const knownSerials = (await adbModule.listDevices(adbPath).catch(() => []))
        .map((device) => device.serial);
      try {
        await adbModule.pairDevice(adbPath, wirelessModule.formatAddress(parsed), pairingCodeValue);
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
    type: 'connect-wireless',
    handler: () => async ({ serial }) => {
      if (!wirelessModule.isWirelessSerial(serial)) {
        return { success: false, message: '仅无线设备需要手动连接' };
      }
      try {
        const ensured = await wirelessModule.ensureWirelessConnected({
          serial,
          adbPath: getAdbPath(),
          adb: adbModule,
        });
        if (!ensured.ok) {
          return { success: false, message: ensured.message };
        }
        return storeWirelessConnection(ensured.serial);
      } catch (e) {
        return { success: false, message: `连接失败: ${e.message}` };
      }
    },
  },
  {
    type: 'remove-wireless',
    handler: () => async ({ serial }) => {
      const stored = getStoredDevices().filter((item) => item.serial !== serial);
      saveStoredDevices(stored);
      try {
        return { success: true, devices: await listMergedDevices() };
      } catch (e) {
        return { success: false, message: `已移除，但刷新设备列表失败: ${e.message}` };
      }
    },
  },
  {
    type: 'remove-stored-device',
    handler: () => async ({ serial }) => {
      const stored = getStoredDevices().filter((item) => item.serial !== serial);
      saveStoredDevices(stored);
      try {
        return { success: true, devices: await listMergedDevices() };
      } catch (e) {
        return { success: false, message: `已移除，但刷新设备列表失败: ${e.message}` };
      }
    },
  },
  {
    type: 'list-usb-candidates',
    handler: () => async () => {
      try {
        const adbPath = getAdbPath();
        const devices = await adbModule.listDevices(adbPath);
        const stored = getStoredDevices();
        const storedSerials = new Set(stored.map((d) => d.serial));
        const usbDevices = devices
          .filter((device) => !wirelessModule.isWirelessSerial(device.serial) && device.state === 'device')
          .map((device) => ({
            serial: device.serial,
            model: device.model || '',
            stored: storedSerials.has(device.serial),
          }));
        return { success: true, devices: usbDevices };
      } catch (e) {
        return { success: false, message: `获取有线设备失败: ${e.message}` };
      }
    },
  },
  {
    type: 'add-stored-device',
    handler: () => async ({ serial, model = '', type = 'usb' }) => {
      if (!serial) {
        return { success: false, message: '缺少设备 serial' };
      }
      const stored = getStoredDevices();
      if (!stored.some((d) => d.serial === serial)) {
        stored.push({ serial, model: model || '', type });
        saveStoredDevices(stored);
      }
      try {
        return { success: true, devices: await listMergedDevices() };
      } catch (e) {
        return { success: false, message: `添加成功，但刷新设备列表失败: ${e.message}` };
      }
    },
  },
  {
    type: 'get-device-config',
    handler: () => async (serial) => {
      if (!serial) {
        return { success: false, message: '缺少设备 serial' };
      }
      return { success: true, config: getDeviceConfig(serial) };
    },
  },
  {
    type: 'set-device-config',
    handler: () => async ({ serial, config }) => {
      if (!serial) {
        return { success: false, message: '缺少设备 serial' };
      }
      saveDeviceConfig(serial, config);
      return { success: true, config: getDeviceConfig(serial) };
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
    handler: () => async (payload) => launchDeviceSession(payload),
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
        await adbModule.sendKeyEvent(session.adbPath, session.serial, keycode, {
          displayId: session.mode === 'mirror' ? 0 : null,
        });
        return { success: true };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'open-in-new-window',
    handler: () => async (sessionId) => {
      const session = scrcpyModule.getSession(sessionId);
      if (!session) {
        return { success: false, message: '会话不存在或已关闭' };
      }
      let inheritedContentSize = null;
      if (session.win && !session.win.isDestroyed()) {
        const [w, h] = session.win.getContentSize();
        inheritedContentSize = { width: w, height: h };
      }
      let targetPkg = session.pkg;
      if (!targetPkg) {
        targetPkg = await adbModule.getForegroundApp(session.adbPath, session.serial, {
          defaultLauncher: session.defaultLauncher,
        });
      }
      if (!targetPkg) {
        return { success: false, message: '前台无运行中的应用' };
      }
      try {
        const devConf = getDeviceConfig(session.serial);
        const result = await scrcpyModule.launchSession({
          mode: 'virtual',
          serial: session.serial,
          pkg: targetPkg,
          inheritedContentSize,
          savedVirtualSize: getSavedVirtualSize(session.serial, targetPkg),
          onSaveVirtualSize: (size) => saveVirtualSize(session.serial, targetPkg, size),
          bitRate: devConf.bitRate,
          maxFps: devConf.maxFps,
          settingValue: getScrcpySetting(),
          logger,
        });
        return { success: true, pkg: targetPkg, ...result };
      } catch (e) {
        logger.error(`[${id}] open in new window failed: ${e.message}`);
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'toggle-screen',
    handler: () => async (sessionId) => {
      const session = scrcpyModule.getSession(sessionId);
      if (!session) {
        return { success: false, message: '会话不存在或已关闭' };
      }
      try {
        const result = await adbModule.toggleScreen(session.adbPath, session.serial);
        return { success: true, ...result };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    // 镜像画面横竖屏切换：锁定设备旋转方向，会话关闭时由主进程恢复原设置
    type: 'rotate-device',
    handler: () => async (sessionId) => {
      const session = scrcpyModule.getSession(sessionId);
      if (!session) {
        return { success: false, message: '会话不存在或已关闭' };
      }
      try {
        if (!session.rotationState) {
          const initial = await adbModule.getSystemRotationState(session.adbPath, session.serial);
          session.rotationState = { initial, forced: null };
        }
        const forced = adbModule.nextForcedRotation(session.rotationState.forced);
        await adbModule.setDeviceRotation(session.adbPath, session.serial, forced);
        session.rotationState.forced = forced;
        return { success: true, rotation: forced };
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
