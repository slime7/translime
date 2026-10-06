import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest';

/**
 * distChangeDetector 是纯文件系统模块（不依赖 Electron），
 * 在临时目录里用真实 fs 验证监听事件的判定契约：
 * 读取产物不触发、真实构建（写入/删除/新增）触发、临时文件噪音不触发。
 * 防止“打开插件 UI 读取 dist/ui.esm.js 被误判为构建产物变化导致热重启”的回归。
 */

const { default: createDistChangeDetector } = await import('@main/core/plugin-loader/distChangeDetector');

describe('plugin-loader/distChangeDetector', () => {
  let workDir;
  let distPath;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translime-dist-detector-'));
    distPath = path.join(workDir, 'dist');
    fs.mkdirSync(path.join(distPath, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(distPath, 'ui.esm.js'), 'console.log(1);', 'utf8');
    fs.writeFileSync(path.join(distPath, 'index.cjs.js'), 'module.exports = {};', 'utf8');
    fs.writeFileSync(path.join(distPath, 'bin', 'index.js'), 'export const bin = 1;', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('读取构建产物（mtime 与 size 均未变化）不应判定为变化', () => {
    const detector = createDistChangeDetector({ distPath });

    // 打开插件 UI 时主进程会读取 dist/ui.esm.js，Windows 会因此抛出 change 事件
    fs.readFileSync(path.join(distPath, 'ui.esm.js'), 'utf8');

    expect(detector.handleWatchEvent('ui.esm.js')).toBe(false);
  });

  it('写入构建产物应判定为变化，同一变化不重复触发', () => {
    const detector = createDistChangeDetector({ distPath });

    fs.writeFileSync(
      path.join(distPath, 'ui.esm.js'),
      'console.log(1);\nconsole.log(2);',
      'utf8',
    );

    expect(detector.handleWatchEvent('ui.esm.js')).toBe(true);
    // fs.watch 对同一次写入常抛出多个事件，快照更新后不应再次触发
    expect(detector.handleWatchEvent('ui.esm.js')).toBe(false);
  });

  it('构建产物被删除应判定为变化', () => {
    const detector = createDistChangeDetector({ distPath });

    fs.rmSync(path.join(distPath, 'ui.esm.js'));

    expect(detector.handleWatchEvent('ui.esm.js')).toBe(true);
  });

  it('新产物文件出现应判定为变化', () => {
    const detector = createDistChangeDetector({ distPath });

    fs.writeFileSync(path.join(distPath, 'overlay.js'), 'export const overlay = 1;', 'utf8');

    expect(detector.handleWatchEvent('overlay.js')).toBe(true);
  });

  it('快照外转瞬即逝的临时文件不应判定为变化', () => {
    const detector = createDistChangeDetector({ distPath });

    // 构建器先写临时文件再重命名时，临时文件在事件处理前已消失
    expect(detector.handleWatchEvent('ui.esm.js.tmp-123')).toBe(false);
  });

  it('事件不带文件名时退化为全量对比', () => {
    const detector = createDistChangeDetector({ distPath });

    expect(detector.handleWatchEvent(undefined)).toBe(false);

    fs.writeFileSync(path.join(distPath, 'index.cjs.js'), 'module.exports = { changed: true };', 'utf8');

    expect(detector.handleWatchEvent(undefined)).toBe(true);
  });

  it('子目录产物变化可识别，且兼容 Windows 反斜杠事件路径', () => {
    const detector = createDistChangeDetector({ distPath });

    fs.writeFileSync(path.join(distPath, 'bin', 'index.js'), 'export const bin = 2;', 'utf8');

    expect(detector.handleWatchEvent('bin\\index.js')).toBe(true);
  });

  it('Linux 风格正斜杠事件路径同样可识别子目录产物变化', () => {
    const detector = createDistChangeDetector({ distPath });

    fs.writeFileSync(path.join(distPath, 'bin', 'index.js'), 'export const bin = 3;', 'utf8');

    expect(detector.handleWatchEvent('bin/index.js')).toBe(true);
  });
});
