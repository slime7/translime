// preview 模式声明式 IPC mock：覆盖扫描、备份列表与同步状态，供 UI 联调
// （真实宿主内的行为以主进程实现为准）

const mockGames = [
  {
    appid: '1245620',
    name: 'Hades',
    installDir: null,
    libraryPath: null,
    savePaths: [],
    saveSources: [],
    backupCount: 2,
    excluded: false,
  },
  {
    appid: 'custom-hollowknight',
    name: 'Hollow Knight',
    isCustom: true,
    installDir: null,
    libraryPath: null,
    savePaths: [],
    saveSources: [],
    backupCount: 1,
    excluded: false,
  },
];

const mockStatus = {
  phase: 'idle',
  pending: false,
  config: { enabled: true, target: 'mydrive:SteamBackups', rclonePath: '' },
  rclone: {
    ok: true, version: '1.75.1', path: 'rclone', error: null,
  },
  dirtyGames: ['1245620'],
  lastReport: {
    startedAt: '2026-10-01T10:00:00.000Z',
    finishedAt: '2026-10-01T10:00:12.000Z',
    ok: true,
    perGame: {
      1245620: { uploads: 1, downloads: 0, renames: 0 },
      'custom-hollowknight': { uploads: 0, downloads: 1, renames: 0 },
    },
    totals: { uploads: 1, downloads: 1, renames: 0 },
  },
  lastError: null,
  lastRunAt: '2026-10-01T10:00:12.000Z',
};

export default {
  'scan-games': async () => ({
    success: true, games: mockGames, userIds: [], steamPath: 'C:/Steam',
  }),
  'get-backups': async () => ({
    success: true,
    backups: [
      {
        schemaVersion: 2,
        gameId: '1245620',
        gameName: 'Hades',
        savePaths: [],
        sources: [],
        backupTime: '2026-10-01T10:00:00.000Z',
        timestamp: '2026-10-01T10-00-00-000Z',
        note: '打完第一章',
        id: '2026-10-01T10-00-00-000Z',
        path: 'C:/mock/1245620/2026-10-01T10-00-00-000Z',
      },
    ],
  }),
  'sync-get-status': async () => ({ success: true, status: mockStatus }),
  'sync-now': async () => ({ success: true, result: 'started' }),
  'sync-cancel': async () => ({ success: true }),
  'sync-check-rclone': async () => ({ success: true, rclone: mockStatus.rclone }),
  'sync-set-config': async (syncConfig) => ({
    success: true,
    status: { ...mockStatus, config: { ...mockStatus.config, ...syncConfig } },
  }),
};
