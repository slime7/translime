import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  normalizeFileSetting,
  resolveAdbPath,
  resolveScrcpyPath,
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
  it('按 PATH 顺序探测 scrcpy.exe 并返回首个命中', () => {
    const exists = new Set([winPath('C:/bin/scrcpy.exe')]);
    const found = searchPathFor('scrcpy', {
      envPath: 'C:/missing;C:/bin;D:/other',
      existsSync: (p) => exists.has(p),
      platform: 'win32',
    });
    expect(found).toBe(winPath('C:/bin/scrcpy.exe'));
  });

  it('未命中或 PATH 为空返回 null', () => {
    expect(searchPathFor('scrcpy', {
      envPath: 'C:/missing',
      existsSync: () => false,
      platform: 'win32',
    })).toBeNull();
    expect(searchPathFor('scrcpy', { envPath: '', existsSync: () => true, platform: 'win32' })).toBeNull();
  });
});

describe('resolveScrcpyPath', () => {
  it('设置项路径优先于 PATH 探测', () => {
    const result = resolveScrcpyPath({
      settingValue: 'D:/custom/scrcpy.exe',
      envPath: 'C:/bin',
      existsSync: () => true,
      platform: 'win32',
    });
    expect(result).toEqual({ command: 'D:/custom/scrcpy.exe', resolved: 'D:/custom/scrcpy.exe' });
  });

  it('PATH 探测命中后 command 与 resolved 为完整路径', () => {
    const result = resolveScrcpyPath({
      settingValue: null,
      envPath: 'C:/bin',
      existsSync: (p) => p === winPath('C:/bin/scrcpy.exe'),
      platform: 'win32',
    });
    expect(result).toEqual({ command: winPath('C:/bin/scrcpy.exe'), resolved: winPath('C:/bin/scrcpy.exe') });
  });

  it('全部未命中回落裸命令名且 resolved 为 null', () => {
    const result = resolveScrcpyPath({
      settingValue: null,
      envPath: 'C:/bin',
      existsSync: () => false,
      platform: 'win32',
    });
    expect(result).toEqual({ command: 'scrcpy', resolved: null });
  });
});

describe('resolveAdbPath', () => {
  it('优先使用 scrcpy 同目录自带的 adb.exe', () => {
    const result = resolveAdbPath({
      scrcpyResolved: winPath('C:/tools/scrcpy/scrcpy.exe'),
      existsSync: (p) => p === winPath('C:/tools/scrcpy/adb.exe'),
      platform: 'win32',
    });
    expect(result).toBe(winPath('C:/tools/scrcpy/adb.exe'));
  });

  it('scrcpy 同目录无 adb 或来源未知时回落裸命令名', () => {
    expect(resolveAdbPath({
      scrcpyResolved: winPath('C:/tools/scrcpy/scrcpy.exe'),
      existsSync: () => false,
      platform: 'win32',
    })).toBe('adb');
    expect(resolveAdbPath({ scrcpyResolved: null, existsSync: () => true, platform: 'win32' })).toBe('adb');
  });

  it('非 Windows 平台探测不带 .exe 后缀', () => {
    const result = resolveAdbPath({
      scrcpyResolved: '/opt/scrcpy/scrcpy',
      existsSync: (p) => p === path.join('/opt/scrcpy', 'adb'),
      platform: 'linux',
    });
    expect(result).toBe(path.join('/opt/scrcpy', 'adb'));
  });
});
