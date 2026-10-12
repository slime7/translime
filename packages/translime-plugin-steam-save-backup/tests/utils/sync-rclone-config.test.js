import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  BACKEND_TYPES,
  baseNameFor,
  buildAliasCreateArgs,
  buildCreateArgs,
  buildInlineRemoteValue,
  canTestRemoteConnection,
  checkRemoteConnection,
  createRemote,
  deleteRemote,
  findBackendType,
  findFreeRemoteName,
  getRemoteConfig,
  getRemoteRawConfig,
  normalizeRootDir,
  parseAliasRemoteValue,
  parseAuthorizeToken,
  parseAuthorizeUrl,
  parseConfigShow,
  parseInlineRemoteValue,
  parseListRemotes,
  remoteNameFor,
  testRemoteConnection,
  updateRemote,
} from '../../src/utils/sync/rclone-config';

describe('remoteNameFor', () => {
  it('按统一前缀生成远程名，便于在系统 rclone 配置中识别本插件创建的远程', () => {
    expect(remoteNameFor('drive')).toBe('translime-drive');
    expect(remoteNameFor('webdav')).toBe('translime-webdav');
  });
});

describe('BACKEND_TYPES 元数据', () => {
  it('每个后端都有唯一 id 与合法的 auth 类型', () => {
    const ids = BACKEND_TYPES.map((backend) => backend.id);
    expect(new Set(ids).size).toBe(ids.length);
    BACKEND_TYPES.forEach((backend) => {
      expect(['oauth', 'fields', 'local']).toContain(backend.auth);
    });
  });

  it('本地路径后端只要求填写路径（不写 rclone 配置，路径即存档根）', () => {
    const local = findBackendType('local');
    expect(local.auth).toBe('local');
    const required = (local.fields || []).filter((field) => field.required);
    expect(required.map((field) => field.key)).toEqual(['dir']);
  });

  it('表单后端的字段定义完整：key 唯一、type 合法、select 带选项与默认值', () => {
    BACKEND_TYPES.filter((backend) => backend.auth === 'fields').forEach((backend) => {
      expect(backend.fields.length).toBeGreaterThan(0);
      const keys = backend.fields.map((field) => field.key);
      expect(new Set(keys).size).toBe(keys.length);
      backend.fields.forEach((field) => {
        expect(['text', 'password', 'select']).toContain(field.type);
        expect(field.label).toBeTruthy();
        if (field.type === 'select') {
          expect(field.choices.length).toBeGreaterThan(0);
          const values = field.choices.map((choice) => choice.value);
          expect(values).toContain(field.default);
        }
      });
    });
  });

  it('OAuth 后端不要求手填凭据字段（授权即创建，必填字段为空）', () => {
    BACKEND_TYPES.filter((backend) => backend.auth === 'oauth').forEach((backend) => {
      const requiredFields = (backend.fields || []).filter((field) => field.required);
      expect(requiredFields).toEqual([]);
    });
  });
});

describe('parseListRemotes', () => {
  it('解析 listremotes 输出：去掉冒号、忽略空行（UI 远程下拉的数据源）', () => {
    expect(parseListRemotes('mydrive:\nnas:\r\n\r\nlocal-disk:\n')).toEqual([
      'mydrive',
      'nas',
      'local-disk',
    ]);
  });

  it('空输出返回空数组（首次使用尚未配置任何远程）', () => {
    expect(parseListRemotes('')).toEqual([]);
    expect(parseListRemotes('\n')).toEqual([]);
  });

  it('不含冒号的行（rclone 提示信息）被忽略，不进入远程列表', () => {
    expect(parseListRemotes('NOTICE: something\nmydrive:\n')).toEqual(['mydrive']);
  });
});

describe('parseAuthorizeUrl', () => {
  it('从 authorize 输出提取本地回调链接（浏览器未自动打开时的备用入口）', () => {
    const stdout = [
      '2026/10/02 07:00:00 NOTICE: Config file "rclone.conf" not found - using defaults',
      'If your browser doesn\'t open automatically go to the following link: http://127.0.0.1:53682/auth/?state=abc123',
    ].join('\n');

    expect(parseAuthorizeUrl(stdout)).toBe('http://127.0.0.1:53682/auth/?state=abc123');
  });

  it('尚未输出链接时返回 null（UI 不渲染备用入口）', () => {
    expect(parseAuthorizeUrl('waiting for auth...')).toBeNull();
  });
});

describe('parseAuthorizeToken', () => {
  it('从授权完成输出提取 token JSON（创建远程时写入 config_token）', () => {
    const stdout = [
      'Paste the following into your remote machine --->',
      'token = {"access_token":"ya29.a0Af","token_type":"Bearer","refresh_token":"1//0x","expiry":"2026-10-02T08:00:00.000Z"}',
      '---End paste---',
    ].join('\n');

    const token = parseAuthorizeToken(stdout);
    expect(token).toContain('"access_token":"ya29.a0Af"');
    expect(JSON.parse(token).refresh_token).toBe('1//0x');
  });

  it('没有 access_token 的花括号内容不算授权成功（防止半截输出误判）', () => {
    expect(parseAuthorizeToken('{"error":"access_denied"}')).toBeNull();
  });
});

describe('buildCreateArgs', () => {
  it('OAuth 后端：config_token 直接作为 key=value 传入且不加 --obscure（对应官方 headless 授权配方，混淆会破坏 token）', () => {
    const args = buildCreateArgs('drive', 'translime-drive', {}, '{"access_token":"ya29"}');

    expect(args).toEqual([
      'config',
      'create',
      'translime-drive',
      'drive',
      'config_token={"access_token":"ya29"}',
    ]);
  });

  it('表单后端：携带 --obscure 混淆密码类字段，空值字段被跳过', () => {
    const args = buildCreateArgs('webdav', 'translime-webdav', {
      url: 'https://dav.jianguoyun.com/dav/',
      vendor: 'other',
      user: 'me@example.com',
      pass: 'app-password',
      extra: '',
    });

    expect(args).toEqual([
      'config',
      'create',
      'translime-webdav',
      'webdav',
      'url=https://dav.jianguoyun.com/dav/',
      'vendor=other',
      'user=me@example.com',
      'pass=app-password',
      '--obscure',
    ]);
  });

  it('onedrive 附加 --auto-confirm 自动完成驱动器选择问答', () => {
    const args = buildCreateArgs('onedrive', 'translime-onedrive', { drive_type: 'personal' }, '{"access_token":"t"}');

    expect(args.at(-1)).toBe('--auto-confirm');
    expect(args).toContain('drive_type=personal');
    expect(args).not.toContain('--obscure');
  });

  it('findBackendType 对未知类型返回 null（IPC 层据此拒绝非法请求）', () => {
    expect(findBackendType('drive')).toBeTruthy();
    expect(findBackendType('not-a-backend')).toBeNull();
  });

  it('密码字段不做 trim（密码本身可能包含空格），普通字段去除首尾空白', () => {
    const args = buildCreateArgs('smb', 'translime-smb', {
      host: ' 192.168.1.10 ',
      user: ' admin ',
      pass: ' secret pass ',
    });

    expect(args).toContain('host=192.168.1.10');
    expect(args).toContain('user=admin');
    expect(args).toContain('pass= secret pass ');
  });
});

describe('parseConfigShow', () => {
  it('解析 config show 输出的键值对，忽略节名行与空行', () => {
    const stdout = [
      '[translime-smb]',
      'type = smb',
      'host = 192.168.1.10',
      '',
      'pass = YjJjM2Q0',
    ].join('\n');

    expect(parseConfigShow(stdout)).toEqual({
      type: 'smb',
      host: '192.168.1.10',
      pass: 'YjJjM2Q0',
    });
  });

  it('值中包含等号时保留完整值（密码可能含 =）', () => {
    expect(parseConfigShow('pass = a=b=c')).toEqual({ pass: 'a=b=c' });
  });
});

describe('normalizeRootDir（存档目录归一化）', () => {
  it('反斜杠转正斜杠、去首尾分隔符与首尾空白', () => {
    // 防止回归：Windows 反斜杠或首尾斜杠会让 alias 锚点出现空路径段或路径错位
    expect(normalizeRootDir(' \\SteamBackups\\ ')).toEqual({ ok: true, value: 'SteamBackups', error: null });
    expect(normalizeRootDir('/nas/saves/')).toEqual({ ok: true, value: 'nas/saves', error: null });
  });

  it('空输入视为不限制', () => {
    expect(normalizeRootDir('')).toEqual({ ok: true, value: '', error: null });
    expect(normalizeRootDir('   ')).toEqual({ ok: true, value: '', error: null });
    expect(normalizeRootDir('/')).toEqual({ ok: true, value: '', error: null });
  });

  it('拒绝「..」路径段：别名锚点不允许逃出存档范围', () => {
    // 防止回归：限制目录含 .. 时用户可以越过锚点浏览整个远端
    expect(normalizeRootDir('saves/../secret').ok).toBe(false);
    expect(normalizeRootDir('..').ok).toBe(false);
  });

  it('拒绝冒号与引号：会破坏连接字符串/引号语法', () => {
    expect(normalizeRootDir('a:b').ok).toBe(false);
    expect(normalizeRootDir('a"b').ok).toBe(false);
  });
});

describe('buildInlineRemoteValue / parseInlineRemoteValue（内联凭据连接字符串）', () => {
  it('构建 `:type,k=v,...:rootDir`：密码字段取预混淆值，空值字段跳过', () => {
    const value = buildInlineRemoteValue('smb', {
      host: '192.168.1.10',
      user: 'admin',
      pass: '明文不应出现',
      domain: '',
    }, 'steam/saves', { pass: 'obSCURED' });

    expect(value).toBe(':smb,host=192.168.1.10,user=admin,pass=obSCURED:steam/saves');
  });

  it('含冒号或逗号的参数值用双引号包裹（rclone 连接字符串语法）', () => {
    // 防止回归：webdav/s3 的 url 含 ://，不转义会被当成路径分隔冒号截断参数段
    const value = buildInlineRemoteValue('webdav', {
      url: 'https://dav.example.com:5006/dav/',
      vendor: 'other',
      user: 'a,b',
    }, 'dir', {});

    expect(value).toBe(':webdav,url="https://dav.example.com:5006/dav/",vendor=other,user="a,b":dir');
  });

  it('参数值包含引号时抛错（连接字符串无法无损表达）', () => {
    expect(() => buildInlineRemoteValue('smb', { user: 'a"b' }, 'dir', {})).toThrow('引号');
  });

  it('parse 与 build 往返一致：还原类型、去引号的参数值与存档目录', () => {
    const built = buildInlineRemoteValue('webdav', {
      url: 'https://dav.example.com:5006/dav/',
      vendor: 'other',
      user: 'me',
      pass: '',
    }, 'sub dir', { pass: '' });
    const parsed = parseInlineRemoteValue(built);

    expect(parsed).toEqual({
      type: 'webdav',
      values: { url: 'https://dav.example.com:5006/dav/', vendor: 'other', user: 'me' },
      rootDir: 'sub dir',
    });
  });

  it('解析 rclone 实测形态：路径段含空格、密码为混淆值', () => {
    // 来自 rclone v1.75.2 实测存储格式：路径段第一个冒号前是参数段
    const parsed = parseInlineRemoteValue(
      ':smb,host=192.168.1.99,user=spike,pass=xolng2So,domain=WORKGROUP:share/steam saves',
    );
    expect(parsed.type).toBe('smb');
    expect(parsed.values).toEqual({
      host: '192.168.1.99',
      user: 'spike',
      pass: 'xolng2So',
      domain: 'WORKGROUP',
    });
    expect(parsed.rootDir).toBe('share/steam saves');
  });

  it('非内联格式返回 null（直连 remote: 路径不是连接字符串）', () => {
    expect(parseInlineRemoteValue('translime-smb-base:dir')).toBeNull();
    expect(parseInlineRemoteValue('')).toBeNull();
  });
});

describe('parseAliasRemoteValue（alias 远程结构分派）', () => {
  it('以 : 开头识别为内联凭据结构', () => {
    const parsed = parseAliasRemoteValue(':smb,host=x:dir');
    expect(parsed).toEqual({
      mode: 'inline', type: 'smb', values: { host: 'x' }, rootDir: 'dir',
    });
  });

  it('name:dir 形态识别为两段式结构并拆出底层远程名', () => {
    expect(parseAliasRemoteValue('translime-drive-base:backup/root')).toEqual({
      mode: 'base',
      baseName: 'translime-drive-base',
      rootDir: 'backup/root',
    });
  });

  it('其他形态返回 null（手工编辑的未知 alias 不进本插件管理流程）', () => {
    expect(parseAliasRemoteValue('no-colon')).toBeNull();
    expect(parseAliasRemoteValue(':bad')).toEqual({
      mode: 'inline', type: 'bad', values: {}, rootDir: '',
    });
  });
});

describe('baseNameFor / findFreeRemoteName / buildAliasCreateArgs', () => {
  it('两段式凭据远程跟随具体远程名命名，便于列表过滤与级联删除', () => {
    expect(baseNameFor('translime-drive')).toBe('translime-drive-base');
    expect(baseNameFor('translime-smb-2')).toBe('translime-smb-2-base');
    expect(buildAliasCreateArgs('translime-drive', 'translime-drive-base:dir')).toEqual([
      'config',
      'create',
      'translime-drive',
      'alias',
      'remote=translime-drive-base:dir',
    ]);
  });

  it('findFreeRemoteName：规范名空闲时直接使用（首个远程保持 translime-<type>）', async () => {
    const exec = async (args) => {
      expect(args).toEqual(['listremotes']);
      return { code: 0, stdout: 'translime-webdav:\n', stderr: '' };
    };

    await expect(findFreeRemoteName(exec, 'smb')).resolves.toBe('translime-smb');
  });

  it('findFreeRemoteName：规范名被占用时依次取空闲序号，同一后端可添加多个', async () => {
    // 防止回归：命名固定会让第二个 SMB 覆盖第一个的凭据，无法并存快速切换
    const exec = async () => ({
      code: 0,
      stdout: 'translime-smb:\ntranslime-smb-2:\ntranslime-webdav:\n',
      stderr: '',
    });

    await expect(findFreeRemoteName(exec, 'smb')).resolves.toBe('translime-smb-3');
  });
});

describe('getRemoteConfig（统一视图）', () => {
  const execWith = (sections) => async (args) => {
    expect(args[0]).toBe('config');
    expect(args[1]).toBe('show');
    const section = sections[args[2]];
    if (!section) {
      return { code: 3, stdout: '', stderr: 'section not found' };
    }
    return {
      code: 0,
      stdout: Object.keys(section).map((key) => `${key} = ${section[key]}`).join('\n'),
      stderr: '',
    };
  };

  it('直连远程：mode=direct，rootDir 为空（未启用限制的旧形态）', async () => {
    const exec = execWith({
      'translime-smb': { type: 'smb', host: '192.168.1.10', pass: 'obSCURED' },
    });

    const config = await getRemoteConfig(exec, 'translime-smb');
    expect(config).toEqual({
      mode: 'direct',
      type: 'smb',
      values: { type: 'smb', host: '192.168.1.10', pass: 'obSCURED' },
      rootDir: '',
      baseName: null,
    });
  });

  it('alias 内联结构：解析连接字符串得到类型、混淆密码与存档目录', async () => {
    const exec = execWith({
      'translime-smb': {
        type: 'alias',
        remote: ':smb,host=192.168.1.10,pass=obSCURED:steam/saves',
      },
    });

    const config = await getRemoteConfig(exec, 'translime-smb');
    expect(config.mode).toBe('inline');
    expect(config.type).toBe('smb');
    expect(config.values.pass).toBe('obSCURED');
    expect(config.rootDir).toBe('steam/saves');
  });

  it('alias 两段式：读取底层凭据远程的类型与配置', async () => {
    const exec = execWith({
      'translime-drive': { type: 'alias', remote: 'translime-drive-base:backup' },
      'translime-drive-base': { type: 'drive', config_token: '{"access_token":"t"}' },
    });

    const config = await getRemoteConfig(exec, 'translime-drive');
    expect(config.mode).toBe('base');
    expect(config.type).toBe('drive');
    expect(config.baseName).toBe('translime-drive-base');
    expect(config.rootDir).toBe('backup');
  });

  it('远程缺少后端类型时报错（外部手工配置的残缺条目不进编辑流程）', async () => {
    const exec = async () => ({ code: 0, stdout: '[broken]\nhost = x\n', stderr: '' });

    await expect(getRemoteRawConfig(exec, 'broken')).rejects.toThrow('缺少后端类型');
  });

  it('config show 失败时携带 rclone 错误信息', async () => {
    const exec = async () => ({ code: 3, stdout: '', stderr: 'remote not found' });

    await expect(getRemoteRawConfig(exec, 'gone')).rejects.toThrow('读取远程配置失败');
  });
});

describe('createRemote（重建语义 + 存档目录结构）', () => {
  const fakeExec = ({ existing = [], stored = {} } = {}) => {
    const remotes = new Set(existing);
    const calls = [];
    return {
      calls,
      exec: async (args) => {
        calls.push(args);
        if (args[0] === 'listremotes') {
          return { code: 0, stdout: [...remotes].map((name) => `${name}:`).join('\n'), stderr: '' };
        }
        if (args[0] === 'config' && args[1] === 'show') {
          const section = stored[args[2]];
          if (!section) {
            return { code: 3, stdout: '', stderr: 'section not found' };
          }
          return {
            code: 0,
            stdout: Object.keys(section).map((key) => `${key} = ${section[key]}`).join('\n'),
            stderr: '',
          };
        }
        if (args[0] === 'config' && args[1] === 'delete') {
          remotes.delete(args[2]);
          return { code: 0, stdout: '', stderr: '' };
        }
        if (args[0] === 'config' && args[1] === 'create') {
          remotes.add(args[2]);
          return { code: 0, stdout: '', stderr: '' };
        }
        if (args[0] === 'obscure') {
          return { code: 0, stdout: `obSCURED(${args[1]})`, stderr: '' };
        }
        return { code: 0, stdout: '', stderr: '' };
      },
      remotes,
    };
  };

  it('rootDir 为空：删除旧远程后按直连结构创建（密码先混淆，关闭 --obscure 原样存储）', async () => {
    const probe = fakeExec({ existing: ['translime-smb'] });

    await createRemote(probe.exec, {
      type: 'smb',
      name: 'translime-smb',
      values: { host: '192.168.1.10', pass: 'plain pass' },
      rootDir: '',
    });

    expect(probe.calls.some((args) => args[0] === 'config' && args[1] === 'delete' && args[2] === 'translime-smb')).toBe(true);
    const createCall = probe.calls.find((args) => args[0] === 'config' && args[1] === 'create' && args[2] === 'translime-smb');
    expect(createCall[3]).toBe('smb');
    expect(createCall).toContain('pass=obSCURED(plain pass)');
    expect(createCall).not.toContain('--obscure');
    expect(probe.calls.some((args) => args[0] === 'obscure' && args[1] === 'plain pass')).toBe(true);
  });

  it('表单后端 + rootDir：先混淆密码，再以 alias 内联凭据创建（凭据不出现在远程列表）', async () => {
    // 防止回归：绑定存档目录后必须写成 alias 结构，否则远程仍暴露整个远端
    const probe = fakeExec({ existing: [] });

    await createRemote(probe.exec, {
      type: 'smb',
      name: 'translime-smb',
      values: { host: '192.168.1.10', user: 'admin', pass: 'plain pass' },
      rootDir: 'steam/saves',
    });

    const createCall = probe.calls.find((args) => args[0] === 'config' && args[1] === 'create' && args[2] === 'translime-smb');
    expect(createCall[3]).toBe('alias');
    expect(createCall[4]).toBe('remote=:smb,host=192.168.1.10,user=admin,pass=obSCURED(plain pass):steam/saves');
    expect(probe.calls.some((args) => args[0] === 'obscure' && args[1] === 'plain pass')).toBe(true);
    expect(probe.calls.some((args) => args.includes('pass=plain pass'))).toBe(false);
  });

  it('OAuth + rootDir：令牌写入 translime-<type>-base，别名锚定存档目录', async () => {
    const probe = fakeExec({ existing: [] });

    await createRemote(probe.exec, {
      type: 'drive',
      name: 'translime-drive',
      values: {},
      token: '{"access_token":"t"}',
      rootDir: 'SteamBackups',
    });

    const baseCreate = probe.calls.find((args) => args[0] === 'config' && args[1] === 'create' && args[2] === 'translime-drive-base');
    expect(baseCreate).toContain('config_token={"access_token":"t"}');
    const aliasCreate = probe.calls.find((args) => args[0] === 'config' && args[1] === 'create' && args[2] === 'translime-drive');
    expect(aliasCreate).toEqual([
      'config',
      'create',
      'translime-drive',
      'alias',
      'remote=translime-drive-base:SteamBackups',
    ]);
  });

  it('OAuth + rootDir 但缺少令牌：直接报错且不删除既有远程', async () => {
    const probe = fakeExec({ existing: ['translime-drive'] });

    await expect(createRemote(probe.exec, {
      type: 'drive',
      name: 'translime-drive',
      values: {},
      rootDir: 'SteamBackups',
    })).rejects.toThrow('缺少授权令牌');
    expect(probe.remotes.has('translime-drive')).toBe(true);
  });

  it('编辑重建（密码留空沿用旧值）：从旧内联结构取混淆密码，不二次输入', async () => {
    // 防止回归：重建语义下若不搬运旧混淆密码，编辑远程会被迫重输密码且留空会丢失凭据
    const probe = fakeExec({
      existing: ['translime-smb'],
      stored: {
        'translime-smb': { type: 'alias', remote: ':smb,host=192.168.1.10,pass=obSCURED(old):steam/saves' },
      },
    });

    await updateRemote(probe.exec, {
      name: 'translime-smb',
      type: 'smb',
      values: { host: '192.168.1.20', user: 'admin', pass: '' },
      rootDir: 'steam/saves2',
    });

    const obscureCalls = probe.calls.filter((args) => args[0] === 'obscure');
    expect(obscureCalls).toEqual([]);
    const createCall = probe.calls.find((args) => args[0] === 'config' && args[1] === 'create' && args[2] === 'translime-smb');
    expect(createCall[4]).toBe('remote=:smb,host=192.168.1.20,user=admin,pass=obSCURED(old):steam/saves2');
  });

  it('编辑重建（直连旧结构 + 密码留空）：搬运旧混淆密码且不再加 --obscure（防二次混淆损坏）', async () => {
    // 防止回归：已混淆密码再走 --obscure 会二次混淆，认证必然失败
    const probe = fakeExec({
      existing: ['translime-smb'],
      stored: {
        'translime-smb': { type: 'smb', host: '192.168.1.10', pass: 'obSCURED(old)' },
      },
    });

    await updateRemote(probe.exec, {
      name: 'translime-smb',
      type: 'smb',
      values: { host: '192.168.1.20', user: 'admin', pass: '' },
      rootDir: '',
    });

    const createCall = probe.calls.find((args) => args[0] === 'config' && args[1] === 'create' && args[2] === 'translime-smb');
    expect(createCall).toContain('pass=obSCURED(old)');
    expect(createCall).not.toContain('--obscure');
  });

  it('清空的可选字段不进入重建参数（如 SMB 域清空后不再携带）', async () => {
    const probe = fakeExec({ existing: [] });

    await updateRemote(probe.exec, {
      name: 'translime-smb',
      type: 'smb',
      values: {
        host: '192.168.1.20', user: 'admin', pass: 'new', domain: '',
      },
      rootDir: 'saves',
    });

    const createCall = probe.calls.find((args) => args[0] === 'config' && args[1] === 'create' && args[2] === 'translime-smb');
    expect(createCall[4]).toBe('remote=:smb,host=192.168.1.20,user=admin,pass=obSCURED(new):saves');
  });
});

describe('deleteRemote（级联删除）', () => {
  it('远程存在时执行 config delete', async () => {
    const calls = [];
    const exec = async (args) => {
      calls.push(args);
      if (args[0] === 'listremotes') {
        return { code: 0, stdout: 'translime-smb:\n', stderr: '' };
      }
      if (args[0] === 'config' && args[1] === 'show') {
        return { code: 0, stdout: 'type = smb\nhost = x\n', stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    };

    await deleteRemote(exec, 'translime-smb');
    expect(calls.some((args) => args[0] === 'config' && args[1] === 'delete')).toBe(true);
  });

  it('远程不存在时不调用 config delete（视为已删除）', async () => {
    const calls = [];
    const exec = async (args) => {
      calls.push(args);
      return { code: 0, stdout: '', stderr: '' };
    };

    await deleteRemote(exec, 'translime-smb');
    expect(calls.every((args) => args[0] === 'listremotes')).toBe(true);
  });

  it('两段式 alias 连带删除底层凭据远程，不留全盘入口', async () => {
    // 防止回归：只删别名会残留 translime-<type>-base 全盘凭据远程
    const calls = [];
    const exec = async (args) => {
      calls.push(args);
      if (args[0] === 'listremotes') {
        return { code: 0, stdout: 'translime-drive:\ntranslime-drive-base:\n', stderr: '' };
      }
      if (args[0] === 'config' && args[1] === 'show') {
        const section = args[2] === 'translime-drive'
          ? { type: 'alias', remote: 'translime-drive-base:backup' }
          : { type: 'drive' };
        return {
          code: 0,
          stdout: Object.keys(section).map((key) => `${key} = ${section[key]}`).join('\n'),
          stderr: '',
        };
      }
      return { code: 0, stdout: '', stderr: '' };
    };

    await deleteRemote(exec, 'translime-drive');
    const deleted = calls.filter((args) => args[0] === 'config' && args[1] === 'delete').map((args) => args[2]);
    expect(deleted).toEqual(['translime-drive', 'translime-drive-base']);
  });

  it('内联 alias 只删除本体（凭据就在别名定义里，无需级联）', async () => {
    const calls = [];
    const exec = async (args) => {
      calls.push(args);
      if (args[0] === 'listremotes') {
        return { code: 0, stdout: 'translime-smb:\n', stderr: '' };
      }
      if (args[0] === 'config' && args[1] === 'show') {
        return { code: 0, stdout: 'type = alias\nremote = :smb,host=x:dir\n', stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    };

    await deleteRemote(exec, 'translime-smb');
    const deleted = calls.filter((args) => args[0] === 'config' && args[1] === 'delete').map((args) => args[2]);
    expect(deleted).toEqual(['translime-smb']);
  });
});

describe('checkRemoteConnection', () => {
  it('连接成功返回 ok（目标带子路径，SMB 根路径列举不触发真实认证）', async () => {
    const exec = async (args, options) => {
      expect(args).toEqual(['lsd', 'translime-smb:share']);
      expect(options).toEqual({ timeoutMs: 30 * 1000 });
      return { code: 0, stdout: '', stderr: '' };
    };

    await expect(checkRemoteConnection(exec, 'translime-smb:share')).resolves.toEqual({ ok: true, error: null });
  });

  it('连接失败返回 rclone 原始错误（SMB 认证失败等在配置时暴露）', async () => {
    const exec = async () => ({
      code: 1,
      stdout: '',
      stderr: 'couldn\'t connect SMB: response error: The attempted logon is invalid.',
    });

    const result = await checkRemoteConnection(exec, 'translime-smb:share');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('The attempted logon is invalid');
  });

  it('支持传入 options.configPath 追加 --config 参数隔离临时配置测试', async () => {
    // 防止回归：使用临时配置文件测试连接时若未传递 --config，会误测系统正式配置甚至报错
    const exec = async (args) => {
      expect(args).toEqual(['lsd', 'testremote:share', '--config', '/tmp/test.conf']);
      return { code: 0, stdout: '', stderr: '' };
    };

    const result = await checkRemoteConnection(exec, 'testremote:share', { configPath: '/tmp/test.conf' });
    expect(result.ok).toBe(true);
  });
});

describe('canTestRemoteConnection（测试连接按钮可用性）', () => {
  const smbBackend = findBackendType('smb');
  const webdavBackend = findBackendType('webdav');
  const driveBackend = findBackendType('drive');

  it('首次添加：表单后端只要填写了主机/服务地址即可用，不依赖系统已有远程', () => {
    // 防止回归：首次添加远程时若依赖历史远程存在性，测试按钮会被错误置灰
    const smbResult = canTestRemoteConnection({
      backend: smbBackend,
      type: 'smb',
      values: { host: '192.168.1.10', user: '', pass: '' },
      remotes: [],
    });
    expect(smbResult).toBe(true);

    const webdavResult = canTestRemoteConnection({
      backend: webdavBackend,
      type: 'webdav',
      values: { url: 'https://dav.example.com', user: '', pass: '' },
      remotes: [],
    });
    expect(webdavResult).toBe(true);
  });

  it('清空主机：即使系统已存在历史远程，只要当前表单清空了核心地址即不可用', () => {
    // 防止回归：仅凭已有远程激活按钮会让用户在修改/清空时误触发对空表单或过时远程的测试
    const result = canTestRemoteConnection({
      backend: smbBackend,
      type: 'smb',
      values: { host: '   ', user: 'admin', pass: '123' },
      remotes: [{ name: 'translime-smb', type: 'smb' }],
    });
    expect(result).toBe(false);
  });

  it('OAuth 后端：仅当系统已存在该类型的受管远程时可用（同类型多个序号远程均计）', () => {
    // 防止回归：远程命名带空闲序号后，仍按类型匹配测试按钮可用性
    expect(canTestRemoteConnection({
      backend: driveBackend,
      type: 'drive',
      values: {},
      remotes: [],
    })).toBe(false);

    expect(canTestRemoteConnection({
      backend: driveBackend,
      type: 'drive',
      values: {},
      remotes: [{ name: 'translime-drive-2', type: 'drive' }],
    })).toBe(true);

    // 类型不匹配或非本插件管理的远程不启用测试
    expect(canTestRemoteConnection({
      backend: driveBackend,
      type: 'drive',
      values: {},
      remotes: [
        { name: 'translime-smb', type: 'smb' },
        { name: 'mydrive', type: 'drive' },
      ],
    })).toBe(false);
  });

  it('本地路径后端：填写了路径即可测试', () => {
    const localBackend = findBackendType('local');
    expect(canTestRemoteConnection({
      backend: localBackend,
      type: 'local',
      values: { dir: 'D:\\Backups' },
      remotes: [],
    })).toBe(true);
    expect(canTestRemoteConnection({
      backend: localBackend,
      type: 'local',
      values: { dir: '   ' },
      remotes: [],
    })).toBe(false);
  });
});

describe('testRemoteConnection（临时表单测试与中断机制）', () => {
  it('首次添加表单测试：使用临时配置文件创建测试远程并执行根路径 lsd，完成后自动清理', async () => {
    // 防止回归：未保存远程测试如果直接查正式配置会因 section not found 失败；不依赖外部子目录
    const calls = [];
    const fakeExec = async (args) => {
      calls.push(args);
      return { code: 0, stdout: '', stderr: '' };
    };

    const result = await testRemoteConnection({
      exec: fakeExec,
      type: 'smb',
      values: { host: '192.168.1.50', user: 'guest', pass: '' },
      name: 'translime-smb',
    });

    expect(result.ok).toBe(true);
    // 第一步：以 --config <tempConf> 创建 testremote 临时配置
    const createCall = calls.find((c) => c[0] === 'config' && c[1] === 'create' && c[2] === 'testremote');
    expect(createCall).toBeTruthy();
    expect(createCall).toContain('--config');
    // 第二步：以 --config <tempConf> 直接对根路径 testremote: 执行 lsd（不依赖子目录）
    const lsdCall = calls.find((c) => c[0] === 'lsd' && c[1] === 'testremote:');
    expect(lsdCall).toBeTruthy();
    expect(lsdCall).toContain('--config');
  });

  it('测试中止：当 isCancelled 为 true 时立即停止后续执行，返回已取消状态', async () => {
    // 防止回归：用户点击返回或确定时，若未立即中止测试，底层子进程会继续空跑阻塞
    const calls = [];
    let cancelled = false;
    const fakeExec = async (args) => {
      calls.push(args);
      // 在创建临时配置后模拟外部取消（如用户点击返回）
      cancelled = true;
      return { code: 0, stdout: '', stderr: '' };
    };

    const result = await testRemoteConnection({
      exec: fakeExec,
      type: 'smb',
      values: { host: '192.168.1.50', user: 'guest' },
      isCancelled: () => cancelled,
    });

    expect(result.cancelled).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('已取消');
    // lsd 不应该被执行
    const lsdCall = calls.find((c) => c[0] === 'lsd');
    expect(lsdCall).toBeUndefined();
  });

  it('编辑既有远程且未输入新密码时，直接复用系统已保存远程并附带覆盖参数进行测试', async () => {
    // 防止回归：已有远程若二次抽取已混淆密码重写临时配置，会导致密码被二次 obscure 损坏并报认证失败；
    // 同时必须附带表单修改的最新参数（如用户名覆盖）
    const calls = [];
    const fakeExec = async (args) => {
      calls.push(args);
      if (args[0] === 'listremotes') {
        return { code: 0, stdout: 'translime-smb:\n', stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    };

    const result = await testRemoteConnection({
      exec: fakeExec,
      type: 'smb',
      name: 'translime-smb',
      values: { host: '192.168.1.50', user: 'guest', pass: '' },
    });

    expect(result.ok).toBe(true);
    // 不应该生成临时配置 config create
    const createCall = calls.find((c) => c[0] === 'config' && c[1] === 'create');
    expect(createCall).toBeUndefined();
    // 应该直接以系统已有的 translime-smb: 执行 lsd，并附带修改后的 --smb-user 覆盖标志
    const lsdCall = calls.find((c) => c[0] === 'lsd' && c[1] === 'translime-smb:');
    expect(lsdCall).toBeTruthy();
    expect(lsdCall).toContain('--smb-user');
    expect(lsdCall).not.toContain('--config');
  });

  it('绑定存档目录：在临时配置中构建 alias 测试远程（新密码现混淆），对别名根执行 lsd', async () => {
    // 防止回归：绑定存档目录后连接测试必须按 alias 结构验证，否则测试通过但真实远程不可用
    const calls = [];
    const fakeExec = async (args) => {
      calls.push(args);
      if (args[0] === 'obscure') {
        return { code: 0, stdout: 'obSCURED(new)', stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    };

    const result = await testRemoteConnection({
      exec: fakeExec,
      type: 'smb',
      values: { host: '192.168.1.50', user: 'guest', pass: 'new pass' },
      name: 'translime-smb',
      rootDir: 'steam/saves',
    });

    expect(result.ok).toBe(true);
    const createCall = calls.find((c) => c[0] === 'config' && c[1] === 'create' && c[2] === 'testremote');
    expect(createCall).toContain('remote=:smb,host=192.168.1.50,user=guest,pass=obSCURED(new):steam/saves');
    const lsdCall = calls.find((c) => c[0] === 'lsd' && c[1] === 'testremote:');
    expect(lsdCall).toBeTruthy();
  });

  it('编辑远程（密码留空）+ 存档目录：沿用旧远程存储的混淆密码重建测试别名', async () => {
    // 防止回归：alias 结构不认识 --smb-* 覆盖参数，密码留空时必须取旧混淆值进临时配置重建
    const calls = [];
    const fakeExec = async (args) => {
      calls.push(args);
      if (args[0] === 'listremotes') {
        return { code: 0, stdout: 'translime-smb:\n', stderr: '' };
      }
      if (args[0] === 'config' && args[1] === 'show') {
        return { code: 0, stdout: 'type = smb\nhost = 192.168.1.50\npass = obSCURED(old)\n', stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    };

    const result = await testRemoteConnection({
      exec: fakeExec,
      type: 'smb',
      values: { host: '192.168.1.60', user: 'guest', pass: '' },
      name: 'translime-smb',
      rootDir: 'steam/saves',
    });

    expect(result.ok).toBe(true);
    expect(calls.some((args) => args[0] === 'obscure')).toBe(false);
    const createCall = calls.find((c) => c[0] === 'config' && c[1] === 'create' && c[2] === 'testremote');
    expect(createCall).toContain('remote=:smb,host=192.168.1.60,user=guest,pass=obSCURED(old):steam/saves');
    // 不应直接对旧远程执行 lsd（旧远程可能是 alias，覆盖参数不生效）
    expect(calls.some((c) => c[0] === 'lsd' && c[1] === 'translime-smb:')).toBe(false);
  });

  it('存档目录尚不存在（directory not found）：视为连接成功并提示首次同步自动创建', async () => {
    // 防止回归：限制目录通常在首次同步时才创建，目录不存在不应被判为连接失败
    const fakeExec = async (args) => {
      if (args[0] === 'obscure') {
        return { code: 0, stdout: 'obSCURED(new)', stderr: '' };
      }
      if (args[0] === 'lsd') {
        return { code: 3, stdout: '', stderr: 'ERROR : error listing: directory not found' };
      }
      return { code: 0, stdout: '', stderr: '' };
    };

    const result = await testRemoteConnection({
      exec: fakeExec,
      type: 'smb',
      values: { host: '192.168.1.50', user: 'guest', pass: 'new' },
      name: 'translime-smb',
      rootDir: 'steam/saves',
    });

    expect(result.ok).toBe(true);
    expect(result.note).toContain('自动创建');
  });

  it('本地 / 网络路径：目录存在时直接通过，全程不调用 rclone', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'translime-local-test-'));
    try {
      const result = await testRemoteConnection({
        exec: async () => {
          throw new Error('local 测试不应调用 rclone');
        },
        type: 'local',
        values: { dir },
      });
      expect(result.ok).toBe(true);
      expect(result.note).toBeUndefined();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('本地 / 网络路径：目录不存在视为可用并提示首次备份/同步时自动创建', async () => {
    // 防止回归：新设备登记尚未落盘的存档目录不应被测试按钮阻断
    const result = await testRemoteConnection({
      exec: async () => {
        throw new Error('local 测试不应调用 rclone');
      },
      type: 'local',
      values: { dir: path.join(os.tmpdir(), `not-exist-${Date.now()}`) },
    });
    expect(result.ok).toBe(true);
    expect(result.note).toContain('自动创建');
  });

  it('本地 / 网络路径：路径是文件而非目录时报错', async () => {
    const file = path.join(os.tmpdir(), `translime-local-file-${Date.now()}.txt`);
    await fs.writeFile(file, 'x');
    try {
      const result = await testRemoteConnection({
        exec: async () => {
          throw new Error('local 测试不应调用 rclone');
        },
        type: 'local',
        values: { dir: file },
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('不是目录');
    } finally {
      await fs.rm(file, { force: true });
    }
  });
});
