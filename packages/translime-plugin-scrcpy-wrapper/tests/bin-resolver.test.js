import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  bundledServerPath,
  normalizeFileSetting,
  resolveAdbPath,
  resolveServerPath,
  searchPathFor,
} from '../src/bin-resolver';

const winPath = (value) => value.replaceAll('/', '\\');

describe('normalizeFileSetting', () => {
  it('兼容数组与字符串两种保存格式', () => {
    expect(normalizeFileSetting(['C:/tools/scrcpy.exe', 'D:/x.exe'])).toBe('C:/tools/scrcpy.exe');
    expect(normalizeFileSetting('C:/tools/scrcpy.exe')).toBe('C:/tools/scrcpy.exe');
    expect(normalizeFileSetting(['', null, 'C:/a.exe'])).toBe('C:/a.exe');
  });

  it('无效输入返回 null', () => {
    expect(normalizeFileSetting('')).toBeNull();
    expect(normalizeFileSetting([])).toBeNull();
    expect(normalizeFileSetting(null)).toBeNull();
  });
});

describe('searchPathFor', () => {
  it('按 PATH 顺序探测 adb.exe 并返回首个命中', () => {
    const exists = new Set([winPath('C:/bin/adb.exe')]);
    const found = searchPathFor('adb', {
      envPath: 'C:/missing;C:/bin;D:/other',
      existsSync: (p) => exists.has(p),
      platform: 'win32',
    });
    expect(found).toBe(winPath('C:/bin/adb.exe'));
  });

  it('未命中或 PATH 为空返回 null', () => {
    expect(searchPathFor('adb', {
      envPath: 'C:/missing',
      existsSync: () => false,
      platform: 'win32',
    })).toBeNull();
    expect(searchPathFor('adb', { envPath: '', existsSync: () => true, platform: 'win32' })).toBeNull();
  });
});

describe('resolveAdbPath', () => {
  it('显式设置项路径优先', () => {
    expect(resolveAdbPath({
      settingValue: 'D:/platform-tools/adb.exe',
      legacyScrcpySettingValue: winPath('C:/tools/scrcpy/scrcpy.exe'),
      existsSync: () => true,
      platform: 'win32',
    })).toBe('D:/platform-tools/adb.exe');
  });

  it('回落旧版 scrcpy 设置项同目录的 adb.exe', () => {
    const result = resolveAdbPath({
      settingValue: null,
      legacyScrcpySettingValue: winPath('C:/tools/scrcpy/scrcpy.exe'),
      existsSync: (p) => p === winPath('C:/tools/scrcpy/adb.exe'),
      platform: 'win32',
    });
    expect(result).toBe(winPath('C:/tools/scrcpy/adb.exe'));
  });

  it('同目录无 adb 时按 PATH 探测，再回落裸命令名', () => {
    expect(resolveAdbPath({
      settingValue: null,
      legacyScrcpySettingValue: winPath('C:/tools/scrcpy/scrcpy.exe'),
      envPath: 'C:/pt',
      existsSync: (p) => p === winPath('C:/pt/adb.exe'),
      platform: 'win32',
    })).toBe(winPath('C:/pt/adb.exe'));
    expect(resolveAdbPath({
      settingValue: null,
      envPath: 'C:/pt',
      existsSync: () => false,
      platform: 'win32',
    })).toBe('adb');
  });

  it('非 Windows 平台探测不带 .exe 后缀', () => {
    const result = resolveAdbPath({
      legacyScrcpySettingValue: '/opt/scrcpy/scrcpy',
      existsSync: (p) => p === path.join('/opt/scrcpy', 'adb'),
      platform: 'linux',
    });
    expect(result).toBe(path.join('/opt/scrcpy', 'adb'));
  });
});

describe('resolveServerPath', () => {
  it('显式设置项存在时优先', () => {
    expect(resolveServerPath({
      settingValue: 'D:/servers/scrcpy-server',
      existsSync: (p) => p === 'D:/servers/scrcpy-server',
    })).toBe('D:/servers/scrcpy-server');
  });

  it('设置项指向不存在的文件时回落捆绑文件', () => {
    expect(resolveServerPath({
      settingValue: 'D:/missing',
      existsSync: (p) => p === bundledServerPath(),
    })).toBe(bundledServerPath());
  });

  it('全部缺失返回 null', () => {
    expect(resolveServerPath({ settingValue: null, existsSync: () => false })).toBeNull();
  });
});
