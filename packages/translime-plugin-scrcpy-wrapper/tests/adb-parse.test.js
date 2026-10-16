import { describe, expect, it } from 'vitest';
import {
  extractSerialFromMdnsInstance,
  nextForcedRotation,
  parseAdbDevices,
  parseMdnsServiceRecords,
  parsePackageList,
  parseSystemSetting,
  parseWmSize,
} from '../src/adb';

describe('parseAdbDevices', () => {
  it('仅保留 state 为 device 的行并解析 model', () => {
    const output = [
      'List of devices attached',
      '0123456789ABCDEF          device usb:1-1 product:oriole model:Pixel_6_Pro device:oriole transport_id:1',
      'emulator-5554             offline',
      '16d1feec                  unauthorized',
      '',
    ].join('\n');
    expect(parseAdbDevices(output)).toEqual([
      { serial: '0123456789ABCDEF', state: 'device', model: 'Pixel 6 Pro' },
    ]);
  });

  it('无 model 信息的设备返回空 model', () => {
    const output = 'List of devices attached\nfoo\tdevice\n';
    expect(parseAdbDevices(output)).toEqual([
      { serial: 'foo', state: 'device', model: '' },
    ]);
  });

  it('空输出与非设备行返回空列表', () => {
    expect(parseAdbDevices('')).toEqual([]);
    expect(parseAdbDevices(null)).toEqual([]);
    expect(parseAdbDevices('daemon not running; starting now')).toEqual([]);
  });
});

describe('parsePackageList', () => {
  it('解析 package: 前缀并排序', () => {
    const output = 'package:com.zoo\npackage:com.alpha\r\npackage:com.mid\n';
    expect(parsePackageList(output)).toEqual([
      'com.alpha',
      'com.mid',
      'com.zoo',
    ]);
  });

  it('跳过异常行，空输出返回空列表', () => {
    expect(parsePackageList('this line has no prefix\npackage:com.ok\n')).toEqual(['com.ok']);
    expect(parsePackageList('')).toEqual([]);
    expect(parsePackageList(undefined)).toEqual([]);
  });
});

describe('parseSystemSetting', () => {
  it('解析 settings get 输出的整数值', () => {
    expect(parseSystemSetting('1\n')).toBe(1);
    expect(parseSystemSetting('0')).toBe(0);
    expect(parseSystemSetting(' 3 ')).toBe(3);
  });

  it('键不存在或非整数返回 null（恢复旋转设置时跳过未知键）', () => {
    expect(parseSystemSetting('null\n')).toBeNull();
    expect(parseSystemSetting('')).toBeNull();
    expect(parseSystemSetting(undefined)).toBeNull();
    expect(parseSystemSetting('1.5')).toBeNull();
  });
});

describe('nextForcedRotation', () => {
  it('横竖屏在 0（竖屏）与 1（横屏）之间往返', () => {
    expect(nextForcedRotation(null)).toBe(1);
    expect(nextForcedRotation(1)).toBe(0);
    expect(nextForcedRotation(0)).toBe(1);
  });
});

describe('parseWmSize', () => {
  it('仅有 Physical size 时返回物理分辨率', () => {
    expect(parseWmSize('Physical size: 1080x2400\n')).toEqual({ width: 1080, height: 2400 });
  });

  it('存在 Override size 时优先返回覆盖分辨率', () => {
    const output = 'Physical size: 1080x2400\nOverride size: 1080x2340\n';
    expect(parseWmSize(output)).toEqual({ width: 1080, height: 2340 });
  });

  it('无法解析或字段非法时返回 null', () => {
    expect(parseWmSize('')).toBeNull();
    expect(parseWmSize(null)).toBeNull();
    expect(parseWmSize('Physical size: abc')).toBeNull();
    expect(parseWmSize('Physical size: 0x0')).toBeNull();
  });
});

describe('extractSerialFromMdnsInstance', () => {
  it('从标准 adb-<serial>-<random> 实例名提取硬件序列号', () => {
    expect(extractSerialFromMdnsInstance('adb-QV770KQAMM-LiOGZb')).toBe('QV770KQAMM');
    expect(extractSerialFromMdnsInstance('adb-ee74bb71-nMA7p7')).toBe('ee74bb71');
    expect(extractSerialFromMdnsInstance('adb-QV780M0W8G-GjdSrv')).toBe('QV780M0W8G');
  });

  it('兼容多网卡/重命名导致的序号后缀如 (2)', () => {
    expect(extractSerialFromMdnsInstance('adb-QV770KQAMM-LiOGZb (2)')).toBe('QV770KQAMM');
    expect(extractSerialFromMdnsInstance('adb-QV770KQAMM-LiOGZb (3)')).toBe('QV770KQAMM');
  });

  it('空值或非法输入返回 null', () => {
    expect(extractSerialFromMdnsInstance('')).toBeNull();
    expect(extractSerialFromMdnsInstance(null)).toBeNull();
    expect(extractSerialFromMdnsInstance('other-service')).toBeNull();
  });
});

describe('parseMdnsServiceRecords', () => {
  it('解析行式输出中的结构化服务记录', () => {
    const output = [
      'List of discovered mdns services',
      'adb-QV770KQAMM-LiOGZb (3)\t_adb-tls-connect._tcp\t192.168.2.20:38927',
      'adb-ee74bb71-nMA7p7\t_adb-tls-connect._tcp\t192.168.2.25:37473',
      '',
    ].join('\n');
    const records = parseMdnsServiceRecords(output);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      instance: 'adb-QV770KQAMM-LiOGZb (3)',
      address: '192.168.2.20:38927',
      ip: '192.168.2.20',
      port: 38927,
      serial: 'QV770KQAMM',
    });
    expect(records[1]).toEqual({
      instance: 'adb-ee74bb71-nMA7p7',
      address: '192.168.2.25:37473',
      ip: '192.168.2.25',
      port: 37473,
      serial: 'ee74bb71',
    });
  });
});
