import {
  describe,
  expect,
  it,
} from 'vitest';
import { parseNetbiosName } from '../../src/utils/sync/netbios';

const CN_WINDOWS_OUTPUT = [
  '',
  '以太网:',
  '节点 IP 址址: [192.168.2.100] 范围 ID: []',
  '',
  '           NetBIOS 远程计算机名称表',
  '',
  '       名称               类型         状态',
  '    ---------------------------------------------',
  '    SLIME-NUC11    <00>  唯一          已注册 ',
  '    WORKGROUP      <00>  组           已注册 ',
  '    SLIME-NUC11    <20>  唯一          已注册 ',
  '',
  '    MAC 地址 = 1C-69-7A-A3-87-DD',
  '',
].join('\r\n');

const EN_WINDOWS_OUTPUT = [
  'Ethernet:',
  'Node IpAddress: [192.168.2.100] Scope Id: []',
  '',
  '           NetBIOS Remote Machine Name Table',
  '',
  '       Name               Type       Status',
  '    ---------------------------------------------',
  '    SLIME-NUC11    <00>  UNIQUE      Registered',
  '    WORKGROUP      <00>  GROUP       Registered',
  '    SLIME-NUC11    <20>  UNIQUE      Registered',
  '',
  '    MAC Address = 1C-69-7A-A3-87-DD',
  '',
].join('\r\n');

describe('parseNetbiosName', () => {
  it('从中文系统的 nbtstat 输出解析远端机器名（跳过 WORKGROUP 组名）', () => {
    expect(parseNetbiosName(CN_WINDOWS_OUTPUT)).toBe('SLIME-NUC11');
  });

  it('从英文系统的 nbtstat 输出解析远端机器名（解析不依赖系统语言）', () => {
    expect(parseNetbiosName(EN_WINDOWS_OUTPUT)).toBe('SLIME-NUC11');
  });

  it('只有 WORKGROUP 条目时返回 null（组名不是机器名）', () => {
    const output = ['    WORKGROUP      <00>  组           已注册 ', ''].join('\r\n');
    expect(parseNetbiosName(output)).toBeNull();
  });

  it('空输出或无名称表的输出返回 null（主机不可达 / 非 Windows 目标）', () => {
    expect(parseNetbiosName('')).toBeNull();
    expect(parseNetbiosName('    找不到主机。\n')).toBeNull();
  });
});
