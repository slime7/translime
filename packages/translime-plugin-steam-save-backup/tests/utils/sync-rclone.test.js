import {
  describe,
  expect,
  it,
} from 'vitest';
import { redactArgs } from '../../src/utils/sync/rclone';

describe('redactArgs', () => {
  it('隐去 key=value 形态的密码与令牌（防止 config create/update 的凭据进入日志）', () => {
    expect(redactArgs([
      'config', 'create', 'translime-webdav', 'webdav',
      'url=https://dav.example.com', 'user=alice', 'pass=hunter2 secret',
      'config_token={"access_token":"abc"}',
    ])).toEqual([
      'config', 'create', 'translime-webdav', 'webdav',
      'url=https://dav.example.com', 'user=alice', 'pass=***',
      'config_token=***',
    ]);
  });

  it('隐去 --key=value 形态的敏感标志值（连接测试的 --<type>-<key> 覆盖）', () => {
    expect(redactArgs([
      'lsd', 'testremote:', '--sftp-host=192.168.1.10',
      '--s3-secret-access-key=SECRET', '--obscure',
    ])).toEqual([
      'lsd', 'testremote:', '--sftp-host=192.168.1.10',
      '--s3-secret-access-key=***', '--obscure',
    ]);
  });

  it('隐去独立成参的 --pass 类标志值（--key value 分离形态）', () => {
    expect(redactArgs(['lsd', 'nas:share', '--webdav-pass', 'p@ss word', '--verbose']))
      .toEqual(['lsd', 'nas:share', '--webdav-pass', '***', '--verbose']);
  });

  it('非敏感参数原样保留：路径、目标、普通键值不受影响', () => {
    expect(redactArgs([
      'copy', 'C:\\backup root', 'GDrive:translime-saves',
      '--include', '/*/*/info.json', '--transfers', '8',
      'host=192.168.1.10',
    ])).toEqual([
      'copy', 'C:\\backup root', 'GDrive:translime-saves',
      '--include', '/*/*/info.json', '--transfers', '8',
      'host=192.168.1.10',
    ]);
  });

  it('空参数列表返回空数组（不抛错）', () => {
    expect(redactArgs([])).toEqual([]);
  });
});
