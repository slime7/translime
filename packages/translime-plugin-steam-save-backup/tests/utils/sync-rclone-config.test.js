import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  BACKEND_TYPES,
  buildCreateArgs,
  buildUpdateArgs,
  checkRemoteConnection,
  deleteRemote,
  findBackendType,
  getRemoteConfig,
  parseAuthorizeToken,
  parseAuthorizeUrl,
  parseConfigShow,
  parseListRemotes,
  remoteNameFor,
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
      expect(['oauth', 'fields']).toContain(backend.auth);
    });
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

describe('getRemoteConfig', () => {
  it('读取远程配置：解析类型与配置字段（编辑回填非密码字段的来源）', async () => {
    const exec = async (args) => {
      expect(args).toEqual(['config', 'show', 'translime-smb']);
      return {
        code: 0,
        stdout: '[translime-smb]\ntype = smb\nhost = 192.168.1.10\nuser = admin\npass = obSCURED\n',
        stderr: '',
      };
    };

    const config = await getRemoteConfig(exec, 'translime-smb');
    expect(config.type).toBe('smb');
    expect(config.host).toBe('192.168.1.10');
    expect(config.pass).toBe('obSCURED');
  });

  it('远程缺少后端类型时报错（外部手工配置的残缺条目不进编辑流程）', async () => {
    const exec = async () => ({ code: 0, stdout: '[broken]\nhost = x\n', stderr: '' });

    await expect(getRemoteConfig(exec, 'broken')).rejects.toThrow('缺少后端类型');
  });

  it('config show 失败时携带 rclone 错误信息', async () => {
    const exec = async () => ({ code: 3, stdout: '', stderr: 'remote not found' });

    await expect(getRemoteConfig(exec, 'gone')).rejects.toThrow('读取远程配置失败');
  });
});

describe('buildUpdateArgs', () => {
  it('只携带非空字段：密码留空不携带（保持原密码），空值字段不写空串', () => {
    const args = buildUpdateArgs('smb', 'translime-smb', {
      host: '192.168.1.20',
      user: 'admin',
      pass: '',
      domain: '',
    });

    expect(args).toEqual([
      'config',
      'update',
      'translime-smb',
      'host=192.168.1.20',
      'user=admin',
      '--obscure',
    ]);
  });

  it('填写了密码则携带更新，且密码不做 trim（密码本身可能包含空格）', () => {
    const args = buildUpdateArgs('webdav', 'translime-webdav', {
      url: 'https://dav.jianguoyun.com/dav/',
      vendor: 'other',
      user: 'me@example.com',
      pass: ' new app password ',
    });

    expect(args).toContain('pass= new app password ');
    expect(args.at(-1)).toBe('--obscure');
  });
});

describe('updateRemote', () => {
  const fakeExec = ({ current = {}, allowUnset = true } = {}) => {
    const stored = { ...current };
    const calls = [];
    return {
      calls,
      exec: async (args) => {
        calls.push(args);
        if (args[0] === 'config' && args[1] === 'show') {
          return {
            code: 0,
            stdout: Object.keys(stored).map((key) => `${key} = ${stored[key]}`).join('\n'),
            stderr: '',
          };
        }
        if (args[0] === 'config' && args[1] === 'update') {
          args.slice(3).forEach((pair) => {
            const eq = pair.indexOf('=');
            const key = pair.slice(0, eq);
            if (key === 'pass' || key === 'secret_access_key') {
              return;
            }
            stored[key] = pair.slice(eq + 1);
          });
          return { code: 0, stdout: '', stderr: '' };
        }
        if (args[0] === 'config' && args[1] === 'unset') {
          if (allowUnset) {
            delete stored[args[3]];
          }
          return { code: 0, stdout: '', stderr: '' };
        }
        return { code: 0, stdout: '', stderr: '' };
      },
      stored,
    };
  };

  it('清空的字段以 config unset 移除（写空串会让后端拿到空选项）', async () => {
    const probe = fakeExec({ current: { type: 'smb', host: '192.168.2.11', domain: '' } });

    await updateRemote(probe.exec, {
      name: 'translime-smb',
      type: 'smb',
      values: {
        host: '192.168.2.11', user: 'slime', pass: '', domain: '',
      },
    });

    expect(probe.calls.some((args) => args[1] === 'unset' && args[3] === 'domain')).toBe(true);
    expect(probe.stored.domain).toBeUndefined();
    expect(probe.stored.user).toBe('slime');
  });

  it('密码留空 = 保持不变：既不更新也不移除', async () => {
    const probe = fakeExec({ current: { type: 'webdav', url: 'https://dav.x/', pass: 'obSCURED' } });

    await updateRemote(probe.exec, {
      name: 'translime-webdav',
      type: 'webdav',
      values: { url: 'https://dav.x/', user: 'me', pass: '' },
    });

    expect(probe.calls.some((args) => args[1] === 'unset' && args[3] === 'pass')).toBe(false);
    expect(probe.calls.some((args) => args.includes('pass='))).toBe(false);
    expect(probe.stored.pass).toBe('obSCURED');
  });
});

describe('deleteRemote', () => {
  it('远程存在时执行 config delete', async () => {
    const calls = [];
    const exec = async (args) => {
      calls.push(args);
      if (args[0] === 'listremotes') {
        return { code: 0, stdout: 'translime-smb:\n', stderr: '' };
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
});
