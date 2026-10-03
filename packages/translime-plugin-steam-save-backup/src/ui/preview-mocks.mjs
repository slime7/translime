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
  {
    appid: '413150',
    name: 'Stardew Valley',
    uninstalled: true,
    installDir: null,
    libraryPath: null,
    savePaths: [
      {
        root: 2, relativePath: 'StardewValley', absolutePath: 'C:/mock/Documents/StardewValley', files: ['SaveGames'],
      },
    ],
    saveSources: [],
    backupCount: 3,
    excluded: false,
  },
];

const mockStatus = {
  phase: 'idle',
  pending: false,
  config: { target: 'mydrive:SteamBackups', rclonePath: '' },
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
    {
      // 墓碑冲突：远端已删除，本机在删除时间点之后仍有更新
      gameId: '413150',
      dir: '2026-09-28T20-00-00-000Z',
      gameName: 'Stardew Valley',
      kind: 'tombstone',
      remoteKind: 'zip',
      local: { backupTime: '2026-09-29T08:00:00.000Z', createdBy: 'aaaa1111-0000-0000-0000-000000000000' },
      remote: { deletedAt: '2026-09-28T22:00:00.000Z', deletedBy: 'bbbb2222-0000-0000-0000-000000000000' },
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
    totals: {
      uploads: 1, downloads: 1, conflicts: 1, deletions: 1,
    },
  },
  lastError: null,
  lastRunAt: '2026-10-01T10:00:12.000Z',
  passthrough: {
    conflicts: [],
    notifications: [],
    lastError: null,
    lastReport: {
      startedAt: '2026-10-01T10:00:00.000Z',
      finishedAt: '2026-10-01T10:00:09.000Z',
      ok: true,
      appliedDeletions: [],
      conflicts: [],
      updated: [{ entryId: 'custom-1abcd23', name: '空洞骑士' }],
      skipped: [],
      errors: [],
    },
    entryCount: 2,
  },
};

const mockPassthroughEntries = [
  {
    entryId: 'custom-1abcd23', name: '空洞骑士', dir: 'C:/mock/Saved Games/Hollow Knight', localExists: true,
  },
  {
    entryId: 'custom-9zzz88', name: '星露谷物语', dir: 'D:/Games/Stardew/Saves', localExists: false,
  },
];

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
  'sync-list-remotes': async () => ({
    success: true,
    remotes: [
      { name: 'mydrive', type: 'drive' },
      { name: 'translime-webdav', type: 'webdav' },
    ],
  }),
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
  'sync-test-remote': async ({ name } = {}) => ({
    success: true,
    // 真实实现返回 rclone lsd 的结果；失败时 { ok: false, error: '<rclone 原始错误>' }
    connection: name === 'translime-webdav'
      ? { ok: false, error: 'mock：连接被拒绝' }
      : { ok: true, error: null },
  }),
  'sync-get-remote': async ({ name }) => ({
    success: true,
    remote: {
      name,
      type: 'webdav',
      // 密码不回填：编辑时留空表示保持不变
      values: {
        url: 'https://dav.example.com/dav/', vendor: 'nextcloud', user: 'mock-user',
      },
    },
  }),
  'sync-delete-remote': async () => ({ success: true, targetCleared: true }),
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
  'passthrough-list': async () => ({
    success: true,
    entries: mockPassthroughEntries,
    status: mockStatus.passthrough,
  }),
  'passthrough-add': async ({ name, dir }) => ({
    success: true,
    entries: [...mockPassthroughEntries, {
      entryId: `custom-${name}`, name, dir, localExists: true,
    }],
  }),
  'passthrough-remove': async ({ deleteRemote }) => ({
    success: true,
    remoteDeleted: Boolean(deleteRemote),
  }),
  'passthrough-open-dir': async () => ({ success: true }),
  // 本地缺失的条目枚举不到文件，返回空来源（详情弹窗走无面板的兜底展示）
  'passthrough-list-files': async ({ name } = {}) => ({
    success: true,
    sources: name === '星露谷物语'
      ? []
      : [{
        id: 'passthrough:mock',
        type: 'custom-directory',
        label: '直通目录',
        absolutePath: 'C:\\Games\\Saves\\Hollow Knight',
        relativePath: '.',
        files: ['user1.dat', 'settings.cfg'],
        enabled: true,
      }],
    empty: name === '星露谷物语',
  }),
  'passthrough-restore': async () => ({ success: true }),
  'passthrough-resolve': async () => ({ success: true }),
};
