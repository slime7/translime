import { parseConnectOutput } from './adb';
import scanOpenPorts from './port-scan';

const WIRELESS_SERIAL_RE = /^[\w.-]+:\d{1,5}$/;

// 无线调试端口由内核从临时端口范围随机分配（Linux 默认 32768-60999），5555 兼容经典 tcpip 模式
const SCAN_PORTS = [5555, ...Array.from({ length: 60999 - 32768 + 1 }, (item, index) => 32768 + index)];

const defaultDelay = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

/**
 * 无线调试设备的 serial 为 `IP:端口` 形式，或 mDNS 服务名形式（如 `adb-xxx._adb-tls-connect._tcp`）
 */
export const isWirelessSerial = (serial) => {
  const str = String(serial ?? '').trim();
  return WIRELESS_SERIAL_RE.test(str)
    || str.startsWith('adb-')
    || str.includes('_adb-tls-')
    || str.includes('._tcp');
};

/**
 * 解析 `IP:端口` 形式的无线调试地址，非法输入返回 null
 */
export const parseAddress = (text) => {
  const value = String(text ?? '').trim();
  if (!WIRELESS_SERIAL_RE.test(value)) {
    return null;
  }
  const separator = value.lastIndexOf(':');
  const ip = value.slice(0, separator);
  const port = Number(value.slice(separator + 1));
  if (!ip || port < 1 || port > 65535) {
    return null;
  }
  return { ip, port };
};

export const formatAddress = ({ ip, port }) => `${ip}:${port}`;

const resolveHardwareSerial = (raw, isWireless) => {
  if (raw.hardwareSerial) {
    return raw.hardwareSerial;
  }
  if (!isWireless) {
    return raw.serial;
  }
  if (raw.serial.startsWith('adb-')) {
    return raw.serial.replace(/^adb-/, '').split('-')[0];
  }
  return raw.serial;
};

/**
 * 合并 adb 在线设备与已保存设备（有线与无线）：
 * 支持按硬件序列号（hardwareSerial）归一化合并，去重同一设备的多个 mDNS/IP 连接；
 * 在线设备回填已保存的机型名并标记 stored 与 connected，
 * 已保存但离线的设备以未连接状态追加，保证设备菜单始终可选
 */
export const mergeWirelessDevices = (devices, stored = []) => {
  const onlineMap = new Map();
  (devices ?? []).forEach((raw) => {
    const isWireless = isWirelessSerial(raw.serial) || raw.type === 'wireless' || Boolean(raw.wireless);
    const hwSerial = resolveHardwareSerial(raw, isWireless);
    const key = hwSerial || raw.serial;
    const adbSerial = raw.adbSerial || raw.serial;
    if (onlineMap.has(key)) {
      const existing = onlineMap.get(key);
      if (existing.serial.startsWith('adb-') && !raw.serial.startsWith('adb-')) {
        onlineMap.set(key, {
          ...existing, ...raw, adbSerial, hardwareSerial: key,
        });
      }
    } else {
      onlineMap.set(key, {
        ...raw, adbSerial, hardwareSerial: key, wireless: isWireless,
      });
    }
  });

  const online = Array.from(onlineMap.values()).map((device) => {
    const isWireless = Boolean(device.wireless);
    const saved = stored.find((item) => (
      item.serial === device.serial
      || (device.hardwareSerial && item.serial === device.hardwareSerial)
      || (device.adbSerial && item.serial === device.adbSerial)
    ));
    const item = {
      serial: isWireless && device.hardwareSerial ? device.hardwareSerial : device.serial,
      state: device.state,
      model: saved?.model || device.model || '',
      wireless: isWireless,
      connected: device.state === 'device',
      stored: Boolean(saved),
    };
    if (device.resolution) {
      item.resolution = device.resolution;
    }
    if (device.adbSerial && device.adbSerial !== item.serial) {
      item.adbSerial = device.adbSerial;
    }
    if (device.hardwareSerial && device.hardwareSerial !== item.serial) {
      item.hardwareSerial = device.hardwareSerial;
    }
    return item;
  });

  const onlineKeys = new Set();
  online.forEach((d) => {
    onlineKeys.add(d.serial);
    if (d.hardwareSerial) {
      onlineKeys.add(d.hardwareSerial);
    }
    if (d.adbSerial) {
      onlineKeys.add(d.adbSerial);
    }
  });

  const offline = stored
    .filter((item) => !onlineKeys.has(item.serial) && (!item.hardwareSerial || !onlineKeys.has(item.hardwareSerial)))
    .map((item) => {
      const isWireless = isWirelessSerial(item.serial) || item.type === 'wireless' || Boolean(item.wireless);
      return {
        serial: item.serial,
        state: 'offline',
        model: item.model || '',
        wireless: isWireless,
        connected: false,
        stored: true,
      };
    });

  return [...online, ...offline];
};

const buildConnectFailMessage = (serial, attempt) => {
  if (attempt?.authError) {
    return `无法连接无线设备 ${serial}：配对信息已失效，请重新配对`;
  }
  return `无法连接无线设备 ${serial}：请确认手机已开启无线调试且与电脑处于同一网络；端口可能已变化，可在手机「无线调试」页面查看最新的 IP 地址和端口`;
};

const tryConnectAddress = (adb, adbPath, address, options = {}) => adb.connectDevice(adbPath, address, options).then(
  (output) => parseConnectOutput(output),
  () => ({ ok: false }),
);

/**
 * 依次尝试候选地址连接，返回第一个连上的地址；全部失败返回 null
 */
const connectFirstCandidate = async (adb, adbPath, candidates) => {
  if (candidates.length === 0) {
    return null;
  }
  const [first, ...rest] = candidates;
  const attempt = await tryConnectAddress(adb, adbPath, first);
  if (attempt.ok) {
    return first;
  }
  return connectFirstCandidate(adb, adbPath, rest);
};

/**
 * mDNS 不可用时的兜底：扫描手机 IP 的临时端口段，对开放端口逐个尝试 adb connect
 */
const connectByPortScan = async ({
  adb, adbPath, ip, excludeSerials = [], scan = scanOpenPorts,
}) => {
  const openPorts = await scan({ host: ip, ports: SCAN_PORTS });
  const tryPort = async (candidates) => {
    if (candidates.length === 0) {
      return null;
    }
    const [port, ...rest] = candidates;
    const address = formatAddress({ ip, port });
    if (excludeSerials.includes(address)) {
      return tryPort(rest);
    }
    const attempt = await tryConnectAddress(adb, adbPath, address, { timeoutMs: 5000 });
    if (attempt.ok) {
      return address;
    }
    return tryPort(rest);
  };
  return tryPort(openPorts);
};

/**
 * 发现指定 IP 的连接端口并连接：先 mDNS，再端口扫描兜底
 */
const connectDiscovered = async ({
  adb, adbPath, ip, excludeSerials = [], scan,
}) => {
  const discovered = await adb.getMdnsConnectAddresses(adbPath).catch(() => []);
  const viaMdns = await connectFirstCandidate(adb, adbPath, discovered
    .filter((address) => !excludeSerials.includes(address) && parseAddress(address)?.ip === ip));
  if (viaMdns) {
    return viaMdns;
  }
  return connectByPortScan({
    adb, adbPath, ip, excludeSerials, scan,
  });
};

/**
 * 确保无线设备处于已连接状态：
 * 已在线直接返回；否则按传入地址连接，失败后用 mDNS 发现的当前端口重连，
 * 再不行扫描端口段兜底（高版本安卓每次开关无线调试或重启后端口都会变化），并回报端口变化
 *
 * adb 注入 { listDevices, connectDevice, getMdnsConnectAddresses, getMdnsServiceRecords } 以便单测
 */
export const ensureWirelessConnected = async ({
  serial, adbPath, adb, ip = null, scan = scanOpenPorts,
}) => {
  const online = await adb.listDevices(adbPath);
  const direct = online.find((device) => (
    (device.serial === serial || device.hardwareSerial === serial)
    && device.state === 'device'
  ));
  if (direct) {
    return { ok: true, serial: direct.serial };
  }

  // 如果传入的是直连 IP:端口，先尝试直接连接
  let attempt = null;
  const parsed = parseAddress(serial);
  if (parsed) {
    attempt = await adb.connectDevice(adbPath, serial).then(
      (output) => parseConnectOutput(output),
      (e) => ({ ok: false, message: e.message }),
    );
    if (attempt.ok) {
      return { ok: true, serial };
    }
  }

  // 从 mDNS 寻找该设备服务：支持按硬件序列号或 IP 匹配
  let records = [];
  if (adb.getMdnsServiceRecords) {
    records = await adb.getMdnsServiceRecords(adbPath).catch(() => []);
  }
  const targetIp = ip || parsed?.ip;
  const matchRecord = records.find((r) => (
    (r.serial && r.serial === serial)
    || (r.instance && r.instance.includes(serial))
  ));
  if (matchRecord?.address) {
    const mdnsAttempt = await tryConnectAddress(adb, adbPath, matchRecord.address);
    if (mdnsAttempt.ok) {
      return { ok: true, serial: matchRecord.address, portChanged: true };
    }
  }

  // 尝试 targetIp 的候选地址
  if (targetIp) {
    const connected = await connectDiscovered({
      adb, adbPath, ip: targetIp, excludeSerials: [serial], scan,
    });
    if (connected) {
      return { ok: true, serial: connected, portChanged: true };
    }
  }

  return {
    ok: false,
    authError: Boolean(attempt?.authError),
    message: attempt?.message || buildConnectFailMessage(serial, attempt),
  };
};

/**
 * 配对成功后建立连接：
 * 轮询在线设备识别新上线的无线设备（新版 adb 配对后会自动回连），
 * 期间辅以 mDNS 发现；轮询结束仍未出现时用端口扫描兜底
 */
export const connectAfterPairing = async ({
  adbPath,
  adb,
  knownSerials = [],
  ip,
  attempts = 5,
  pollIntervalMs = 1000,
  scan = scanOpenPorts,
  delay = defaultDelay,
}) => {
  const devices = await adb.listDevices(adbPath).catch(() => []);
  const fresh = devices.find((device) => isWirelessSerial(device.serial)
    && !knownSerials.includes(device.serial)
    && (!ip || parseAddress(device.serial)?.ip === ip));
  if (fresh) {
    let hwSerial = null;
    if (adb.getDeviceHardwareSerial) {
      hwSerial = await adb.getDeviceHardwareSerial(adbPath, fresh.serial).catch(() => null);
    }
    if (hwSerial) {
      return {
        ok: true,
        serial: hwSerial,
        adbSerial: fresh.serial,
        hardwareSerial: hwSerial,
        ip: parseAddress(fresh.serial)?.ip || ip,
        model: fresh.model || '',
      };
    }
    return { ok: true, serial: fresh.serial };
  }
  const viaMdns = await connectFirstCandidate(adb, adbPath, (await adb.getMdnsConnectAddresses(adbPath).catch(() => []))
    .filter((address) => !knownSerials.includes(address) && parseAddress(address)?.ip === ip));
  if (viaMdns) {
    let hwSerial = null;
    if (adb.getDeviceHardwareSerial) {
      hwSerial = await adb.getDeviceHardwareSerial(adbPath, viaMdns).catch(() => null);
    }
    if (hwSerial) {
      return {
        ok: true,
        serial: hwSerial,
        adbSerial: viaMdns,
        hardwareSerial: hwSerial,
        ip: parseAddress(viaMdns)?.ip || ip,
      };
    }
    return { ok: true, serial: viaMdns };
  }
  if (attempts <= 1) {
    const viaScan = await connectByPortScan({
      adb, adbPath, ip, excludeSerials: knownSerials, scan,
    });
    if (viaScan) {
      let hwSerial = null;
      if (adb.getDeviceHardwareSerial) {
        hwSerial = await adb.getDeviceHardwareSerial(adbPath, viaScan).catch(() => null);
      }
      if (hwSerial) {
        return {
          ok: true,
          serial: hwSerial,
          adbSerial: viaScan,
          hardwareSerial: hwSerial,
          ip: parseAddress(viaScan)?.ip || ip,
        };
      }
      return { ok: true, serial: viaScan };
    }
    return {
      ok: false,
      message: '已配对成功，但未能连接设备。请保持手机无线调试开启并与电脑处于同一网络后重试；若路由器开启了 AP 隔离或热点，请关闭对应隔离选项',
    };
  }
  await delay(pollIntervalMs);
  return connectAfterPairing({
    adbPath,
    adb,
    knownSerials,
    ip,
    attempts: attempts - 1,
    pollIntervalMs,
    scan,
    delay,
  });
};
