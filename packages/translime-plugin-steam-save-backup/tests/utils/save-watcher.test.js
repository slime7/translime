import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import createSaveWatcher from '../../src/utils/save-watcher';

let tmpRoot;
let saveDir;

beforeEach(async () => {
  vi.useFakeTimers();
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-watcher-test-'));
  saveDir = path.join(tmpRoot, 'game-saves');
  await fs.mkdir(saveDir, { recursive: true });
});

afterEach(async () => {
  vi.useRealTimers();
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

const writeFile = (name, content = 'x') => fs.writeFile(path.join(saveDir, name), content, 'utf8');

// 等待 fs.watch 事件经 libuv 送达：先冲刷一次微任务再推进时钟
const flushEvents = () => vi.advanceTimersByTimeAsync(1);

describe('createSaveWatcher', () => {
  it('目录内连续写入合并为一次回调（游戏游玩期间高频写存档只触发一次同步）', async () => {
    const changes = [];
    const watcher = createSaveWatcher({
      debounceMs: 100,
      onChange: (dir) => changes.push(dir),
    });
    watcher.setDirs([saveDir]);

    await writeFile('a.sav');
    await writeFile('b.sav');
    await flushEvents();
    await vi.advanceTimersByTimeAsync(50);
    await writeFile('c.sav');
    await flushEvents();
    await vi.advanceTimersByTimeAsync(100);

    expect(changes).toEqual([saveDir]);
    watcher.close();
  });

  it('静默期后的新变更再次触发（长期游玩过程中持续同步而不是只同步一次）', async () => {
    const changes = [];
    const watcher = createSaveWatcher({
      debounceMs: 100,
      onChange: (dir) => changes.push(dir),
    });
    watcher.setDirs([saveDir]);

    await writeFile('a.sav');
    await flushEvents();
    await vi.advanceTimersByTimeAsync(100);
    await writeFile('b.sav');
    await flushEvents();
    await vi.advanceTimersByTimeAsync(100);

    expect(changes).toEqual([saveDir, saveDir]);
    watcher.close();
  });

  it('同步抑制期内事件不触发回调，释放后静默宽限期内也不触发（防止同步回写引发回环）', async () => {
    const changes = [];
    const watcher = createSaveWatcher({
      debounceMs: 100,
      quietMs: 200,
      onChange: (dir) => changes.push(dir),
    });
    watcher.setDirs([saveDir]);

    watcher.beginSuppress(saveDir);
    await writeFile('during-sync.sav');
    await flushEvents();
    await vi.advanceTimersByTimeAsync(500);
    expect(changes).toEqual([]);

    watcher.endSuppress(saveDir);
    // 静默宽限期内 rclone 的余量回写同样被忽略
    await writeFile('residual.sav');
    await flushEvents();
    await vi.advanceTimersByTimeAsync(150);
    expect(changes).toEqual([]);

    watcher.close();
  });

  it('抑制期内发生过事件且释放后宽限期满 → 补发一次（真实变更不因同步而被丢弃）', async () => {
    const changes = [];
    const watcher = createSaveWatcher({
      debounceMs: 100,
      quietMs: 200,
      onChange: (dir) => changes.push(dir),
    });
    watcher.setDirs([saveDir]);

    watcher.beginSuppress(saveDir);
    await writeFile('real-change.sav');
    await flushEvents();
    watcher.endSuppress(saveDir);
    await vi.advanceTimersByTimeAsync(200);

    expect(changes).toEqual([saveDir]);
    watcher.close();
  });

  it('暂停期间事件不触发回调，恢复后静默期补发一次（游戏全屏期间存档高频变动不引发同步）', async () => {
    const changes = [];
    const watcher = createSaveWatcher({
      debounceMs: 100,
      quietMs: 200,
      onChange: (dir) => changes.push(dir),
    });
    watcher.setDirs([saveDir]);

    watcher.pause();
    await writeFile('in-game.sav');
    await flushEvents();
    await vi.advanceTimersByTimeAsync(1000);
    expect(changes).toEqual([]);

    watcher.resume();
    await vi.advanceTimersByTimeAsync(200);
    expect(changes).toEqual([saveDir]);
    watcher.close();
  });

  it('暂停与同步抑制互不干扰：暂停前已进入同步抑制的目录由同步逻辑释放，恢复不再重复接管', async () => {
    const changes = [];
    const watcher = createSaveWatcher({
      debounceMs: 100,
      quietMs: 200,
      onChange: (dir) => changes.push(dir),
    });
    watcher.setDirs([saveDir]);

    // 同步开始抑制，随后进入全屏暂停
    watcher.beginSuppress(saveDir);
    watcher.pause();
    await writeFile('both.sav');
    await flushEvents();

    // 同步先结束：按同步语义在宽限期后补发
    watcher.endSuppress(saveDir);
    await vi.advanceTimersByTimeAsync(200);
    expect(changes).toEqual([saveDir]);

    // 暂停恢复不应再次补发同一目录（quiet 期内事件已消费完）
    watcher.resume();
    await vi.advanceTimersByTimeAsync(400);
    expect(changes).toEqual([saveDir]);
    watcher.close();
  });

  it('暂停期间防抖中的未决变更转入补发队列，恢复后不丢失', async () => {
    const changes = [];
    const watcher = createSaveWatcher({
      debounceMs: 100,
      quietMs: 200,
      onChange: (dir) => changes.push(dir),
    });
    watcher.setDirs([saveDir]);

    await writeFile('pending.sav');
    await flushEvents();
    // 防抖计时器尚未到期就暂停
    await vi.advanceTimersByTimeAsync(50);
    watcher.pause();
    await vi.advanceTimersByTimeAsync(1000);
    expect(changes).toEqual([]);

    watcher.resume();
    await vi.advanceTimersByTimeAsync(200);
    expect(changes).toEqual([saveDir]);
    watcher.close();
  });

  it('setDirs 移除目录后不再触发其事件（监控集与条目配置保持一致）', async () => {
    const changes = [];
    const watcher = createSaveWatcher({
      debounceMs: 100,
      onChange: (dir) => changes.push(dir),
    });
    watcher.setDirs([saveDir]);
    watcher.setDirs([]);

    await writeFile('x.sav');
    await flushEvents();
    await vi.advanceTimersByTimeAsync(200);

    expect(changes).toEqual([]);
    watcher.close();
  });

  it('监控不存在的目录走 onError 降级而不是崩溃（目录被删除等场景）', () => {
    const errors = [];
    const watcher = createSaveWatcher({
      onError: (dir) => errors.push(dir),
    });
    const missing = path.join(tmpRoot, 'not-exist');
    watcher.setDirs([missing]);

    expect(errors).toEqual([missing]);
    watcher.close();
  });

  it('close 之后不再触发任何回调（插件卸载必须停表，防止向已卸载服务投递事件）', async () => {
    const changes = [];
    const watcher = createSaveWatcher({
      debounceMs: 100,
      onChange: (dir) => changes.push(dir),
    });
    watcher.setDirs([saveDir]);
    watcher.close();

    await writeFile('after-close.sav');
    await flushEvents();
    await vi.advanceTimersByTimeAsync(200);

    expect(changes).toEqual([]);
  });
});
