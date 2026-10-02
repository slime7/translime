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
  conflicts: [
    {
      gameId: '1245620',
      dir: '2026-10-01T10-00-00-000Z',
      gameName: 'Hades',
      local: { backupTime: '2026-10-01T10:00:00.000Z', createdBy: 'aaaa1111-0000-0000-0000-000000000000' },
      remote: { backupTime: '2026-10-01T09:30:00.000Z', createdBy: 'bbbb2222-0000-0000-0000-000000000000' },
      detectedAt: '2026-10-01T10:05:00.000Z',
    },
  ],
  lastReport: {
    startedAt: '2026-10-01T10:00:00.000Z',
    finishedAt: '2026-10-01T10:00:12.000Z',
    ok: true,
    perGame: {
      1245620: { uploads: 1, downloads: 0, conflicts: 1 },
      'custom-hollowknight': { uploads: 0, downloads: 1, conflicts: 0 },
    },
    totals: { uploads: 1, downloads: 1, conflicts: 1 },
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
  'sync-list-remotes': async () => ({ success: true, remotes: ['mydrive', 'nas-webdav'] }),
  'sync-backend-types': async () => ({
    success: true,
    backends: [
      {
        id: 'drive',
        label: 'Google Drive',
        auth: 'oauth',
        hint: '点击授权后在浏览器完成 Google 登录，rclone 官方应用承担 OAuth',
      },
      {
        id: 'webdav',
        label: 'WebDAV（坚果云 / Nextcloud / Alist 等）',
        auth: 'fields',
        hint: '填写服务地址与账号密码',
        fields: [
          {
            key: 'url',
            label: '服务地址',
            type: 'text',
            required: true,
            placeholder: '例如：https://dav.jianguoyun.com/dav/',
          },
          {
            key: 'vendor',
            label: '服务类型',
            type: 'select',
            default: 'other',
            choices: [
              { title: '其他 (Other)', value: 'other' },
              { title: 'Nextcloud', value: 'nextcloud' },
            ],
          },
          {
            key: 'user', label: '用户名', type: 'text', required: true,
          },
          {
            key: 'pass', label: '密码 / 应用密码', type: 'password', required: true,
          },
        ],
      },
    ],
  }),
  'sync-create-remote': async () => ({ success: true, remote: 'translime-drive:' }),
  'sync-cancel-authorize': async () => ({ success: true }),
  'sync-resolve-conflict': async ({ gameId, dir }) => ({
    success: true,
    status: {
      ...mockStatus,
      conflicts: mockStatus.conflicts.filter(
        (item) => !(item.gameId === String(gameId) && item.dir === dir),
      ),
    },
  }),
};
