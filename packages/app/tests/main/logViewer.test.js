import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { listLogDates, readLogRecords } from '../../src/main/utils/logViewer';

const createTempAppData = async () => {
  const appDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'translime-log-viewer-'));
  await fs.mkdir(path.join(appDataPath, 'logs'), { recursive: true });
  return appDataPath;
};

describe('logViewer utils', () => {
  it('lists available log dates from common and error files', async () => {
    const appDataPath = await createTempAppData();
    const logDir = path.join(appDataPath, 'logs');

    await fs.writeFile(path.join(logDir, 'common-2026-03-24.log'), '', 'utf8');
    await fs.writeFile(path.join(logDir, 'error-2026-03-23.log'), '', 'utf8');
    await fs.writeFile(path.join(logDir, 'common-2026-03-23.log'), '', 'utf8');
    await fs.writeFile(path.join(logDir, 'common-2026-03-241.log'), '', 'utf8');

    const dates = await listLogDates(appDataPath);

    expect(dates).toEqual(['2026-03-24', '2026-03-23']);
  });

  it('merges common and error logs and keeps parse error records', async () => {
    const appDataPath = await createTempAppData();
    const logDir = path.join(appDataPath, 'logs');

    await fs.writeFile(
      path.join(logDir, 'common-2026-03-24.log'),
      [
        JSON.stringify({
          level: 'info',
          message: 'app start',
          timestamp: '2026-03-24 09:00:00',
          event: '启动',
        }),
        'invalid-json-line',
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      path.join(logDir, 'error-2026-03-24.log'),
      JSON.stringify({
        level: 'error',
        message: 'plugin failed',
        timestamp: '2026-03-24 09:01:00',
        data: {
          plugin: 'demo',
        },
      }),
      'utf8',
    );

    const result = await readLogRecords(appDataPath, '2026-03-24');

    expect(result.files).toHaveLength(2);
    expect(result.records).toHaveLength(3);
    expect(result.records[0].message).toBe('plugin failed');
    expect(result.records[0].source).toBe('error');
    expect(result.records[1].message).toBe('app start');
    expect(result.records[2].parseError).toBe(true);
  });

  it('marks plugin logs with plugin_id', async () => {
    const appDataPath = await createTempAppData();
    const logDir = path.join(appDataPath, 'logs');

    await fs.writeFile(
      path.join(logDir, 'common-2026-03-24.log'),
      JSON.stringify({
        level: 'info',
        message: 'plugin message',
        timestamp: '2026-03-24 10:00:00',
        plugin_id: 'translime-plugin-demo',
      }),
      'utf8',
    );

    const result = await readLogRecords(appDataPath, '2026-03-24');

    expect(result.records[0].pluginId).toBe('translime-plugin-demo');
  });

  it('returns empty records when selected date has no files', async () => {
    const appDataPath = await createTempAppData();

    const result = await readLogRecords(appDataPath, '2026-03-24');

    expect(result.records).toEqual([]);
    expect(result.files).toEqual([
      expect.objectContaining({ source: 'common', exists: false }),
      expect.objectContaining({ source: 'error', exists: false }),
    ]);
  });

  it('reads sharded files for the same date', async () => {
    const appDataPath = await createTempAppData();
    const logDir = path.join(appDataPath, 'logs');

    await fs.writeFile(
      path.join(logDir, 'common-2026-02-10.log'),
      JSON.stringify({
        level: 'info',
        message: 'base file',
        timestamp: '2026-02-10 09:00:00',
      }),
      'utf8',
    );
    await fs.writeFile(
      path.join(logDir, 'common-2026-02-101.log'),
      JSON.stringify({
        level: 'warn',
        message: 'shard 1',
        timestamp: '2026-02-10 09:10:00',
      }),
      'utf8',
    );
    await fs.writeFile(
      path.join(logDir, 'common-2026-02-102.log'),
      JSON.stringify({
        level: 'error',
        message: 'shard 2',
        timestamp: '2026-02-10 09:20:00',
      }),
      'utf8',
    );

    const result = await readLogRecords(appDataPath, '2026-02-10');

    expect(result.files).toEqual([
      expect.objectContaining({ source: 'common', exists: true, suffix: '' }),
      expect.objectContaining({ source: 'common', exists: true, suffix: '1' }),
      expect.objectContaining({ source: 'common', exists: true, suffix: '2' }),
      expect.objectContaining({ source: 'error', exists: false }),
    ]);
    expect(result.records.map((item) => item.message)).toEqual([
      'shard 2',
      'shard 1',
      'base file',
    ]);
  });
});
