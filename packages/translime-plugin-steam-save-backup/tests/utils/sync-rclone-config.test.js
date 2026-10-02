import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  BACKEND_TYPES,
  buildCreateArgs,
  findBackendType,
  parseAuthorizeToken,
  parseAuthorizeUrl,
  parseListRemotes,
  remoteNameFor,
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
});
