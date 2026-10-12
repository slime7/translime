// preview 模式声明式 IPC mock 数据

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
  config: {
    target: 'translime-webdav:',
    rclonePath: '',
    localTargets: ['D:\\Backups\\Steam', '\\\\NAS\\share\\saves'],
  },
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
      // 墓碑冲突数据
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
    conflicts: [
      {
        // 内容冲突数据
        entryId: 'custom-1abcd23',
        name: '空洞骑士',
        kind: 'content',
        localUpdatedAt: '2026-10-01T11:20:00.000Z',
        remoteUpdatedAt: '2026-10-01T11:05:00.000Z',
        remoteUpdatedBy: 'bbbb2222-0000-0000-0000-000000000000',
        detectedAt: '2026-10-01T11:25:00.000Z',
      },
    ],
    notifications: [],
    lastError: null,
    lastReport: {
      startedAt: '2026-10-01T10:00:00.000Z',
      finishedAt: '2026-10-01T10:00:09.000Z',
      ok: true,
      appliedDeletions: [],
      conflicts: [
        { entryId: 'custom-1abcd23', name: '空洞骑士', kind: 'content' },
      ],
      updated: [],
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
      { name: 'mydrive', type: 'drive', rootDir: '' },
      { name: 'translime-webdav', type: 'webdav', rootDir: 'SteamBackups' },
      { name: 'translime-smb-2', type: 'smb', rootDir: 'saves/nas2' },
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
      {
        id: 'smb',
        label: 'SMB / NAS 共享',
        auth: 'fields',
        hint: '填写 NAS 地址与账号密码',
        fields: [
          {
            key: 'host',
            label: '主机地址',
            type: 'text',
            required: true,
            placeholder: '例如：192.168.1.10',
          },
          {
            key: 'user',
            label: '用户名',
            type: 'text',
            placeholder: '目标设备的账户名（如 Windows / NAS 登录名）',
            tooltip: {
              subhead: '用户名与「域」的填写方式',
              lines: [
                { title: 'NAS / Samba 账户', text: '直接填登录账户名，「域」留空。' },
                { title: 'Windows 本地账户', text: '填本地账户名，「域」留空；登录失败时改填目标机器名。' },
                { title: 'Windows 微软账户（邮箱登录）', text: '填完整邮箱，「域」必须填目标机器名，否则会登录失败。' },
                { title: 'Windows AD 域账户', text: '填域内账户名，「域」填 AD 域名（NetBIOS 名，如 CORP）。' },
                { title: '域\\用户名 写法', text: '不会被自动拆分，请分开两栏填写。' },
                { title: '留空', text: '使用本机当前登录的用户名。' },
              ],
            },
          },
          {
            key: 'pass',
            label: '密码',
            type: 'password',
          },
          {
            key: 'domain',
            label: '域（可选）',
            type: 'text',
            placeholder: 'WORKGROUP',
          },
        ],
      },
    ],
  }),
  'sync-create-remote': async ({ type, values, editName } = {}) => ({
    success: true,
    remote: type === 'local' ? String(values?.dir || 'D:\\mock\\path') : 'translime-drive:',
    targetAdjusted: Boolean(editName),
  }),
  'sync-test-remote': async ({ name, type } = {}) => {
    let connection;
    if (type === 'local') {
      connection = { ok: true, error: null };
    } else if (name === 'translime-webdav') {
      connection = { ok: false, error: 'mock：连接被拒绝' };
    } else {
      connection = { ok: true, error: null };
    }
    return { success: true, connection };
  },
  'sync-get-remote': async ({ name }) => ({
    success: true,
    remote: {
      name,
      type: 'webdav',
      rootDir: 'SteamBackups',
      // 密码字段不回填
      values: {
        url: 'https://dav.example.com/dav/', vendor: 'nextcloud', user: 'mock-user',
      },
    },
  }),
  'sync-delete-remote': async () => ({ success: true, targetCleared: true }),
  'sync-cancel-authorize': async () => ({ success: true }),
  // 发现远程数据 mock
  'sync-discover-remote': async () => ({
    success: true,
    games: [
      {
        gameId: '1245620',
        gameName: 'Hades',
        added: true,
        backupCount: 2,
        latestBackupTime: '2026-10-01T10:00:00.000Z',
        backups: [
          {
            dir: '2026-10-01T10-00-00-000Z', backupTime: '2026-10-01T10:00:00.000Z', createdBy: 'aaaa1111-0000-0000-0000-000000000000', note: '打完第一章',
          },
          {
            dir: '2026-09-30T09-00-00-000Z', backupTime: '2026-09-30T09:00:00.000Z', createdBy: 'bbbb2222-0000-0000-0000-000000000000', note: '',
          },
        ],
      },
      {
        gameId: 'custom-eldenring',
        gameName: '艾尔登法环',
        added: false,
        backupCount: 1,
        latestBackupTime: '2026-09-28T21:30:00.000Z',
        backups: [
          {
            dir: '2026-09-28T21-30-00-000Z', backupTime: '2026-09-28T21:30:00.000Z', createdBy: 'bbbb2222-0000-0000-0000-000000000000', note: '',
          },
        ],
      },
    ],
    passthrough: [
      {
        entryId: 'custom-1abcd23', name: '空洞骑士', added: true, updatedAt: '2026-10-01T09:00:00.000Z', updatedBy: 'aaaa1111-0000-0000-0000-000000000000',
      },
      {
        entryId: 'custom-9zzz88', name: '星露谷物语', added: false, updatedAt: '2026-09-28T20:00:00.000Z', updatedBy: 'bbbb2222-0000-0000-0000-000000000000',
      },
    ],
  }),
  'add-custom-save-dir': async ({ gameName, dir }) => ({
    success: true,
    customDirs: [{ gameName, dir }],
  }),
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
  // 列举存档文件 mock
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
