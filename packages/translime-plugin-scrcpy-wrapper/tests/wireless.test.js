import {
  describe, expect, it, vi,
} from 'vitest';
import { parseConnectOutput, parseMdnsServices } from '../src/adb';
import {
  ensureWirelessConnected,
  formatAddress,
  isWirelessSerial,
  mergeWirelessDevices,
  parseAddress,
} from '../src/wireless';

describe('parseAddress', () => {
  it('解析合法 IP:端口并可还原为字符串', () => {
    expect(parseAddress('192.168.1.5:37895')).toEqual({ ip: '192.168.1.5', port: 37895 });
    expect(formatAddress({ ip: '192.168.1.5', port: 37895 })).toBe('192.168.1.5:37895');
  });

  it('首尾空白不影响解析', () => {
    expect(parseAddress(' 192.168.1.5:40000 \n')).toEqual({ ip: '192.168.1.5', port: 40000 });
  });

  it('拒绝缺端口、端口越界与非数字端口', () => {
    expect(parseAddress('192.168.1.5')).toBeNull();
    expect(parseAddress('192.168.1.5:0')).toBeNull();
    expect(parseAddress('192.168.1.5:99999')).toBeNull();
    expect(parseAddress('192.168.1.5:abc')).toBeNull();
    expect(parseAddress(':37895')).toBeNull();
    expect(parseAddress('')).toBeNull();
    expect(parseAddress(null)).toBeNull();
  });
});

describe('isWirelessSerial', () => {
  it('仅 IP:端口 形式的 serial 视为无线设备', () => {
    expect(isWirelessSerial('192.168.1.5:37895')).toBe(true);
    expect(isWirelessSerial('phone-abc:5555')).toBe(true);
    expect(isWirelessSerial('0123456789ABCDEF')).toBe(false);
    expect(isWirelessSerial('emulator-5554')).toBe(false);
    expect(isWirelessSerial('')).toBe(false);
  });
});

describe('parseConnectOutput', () => {
  it('connected 与 already connected 均视为成功', () => {
    expect(parseConnectOutput('connected to 192.168.1.5:37895')).toEqual({ ok: true });
    expect(parseConnectOutput('already connected to 192.168.1.5:37895')).toEqual({ ok: true });
  });

  it('cannot connect 视为失败（部分 adb 版本失败仍以 0 退出）', () => {
    const result = parseConnectOutput('cannot connect to 192.168.1.5:37895: (10061)');
    expect(result.ok).toBe(false);
  });

  it('认证失败标记 authError，供上层提示重新配对', () => {
    const result = parseConnectOutput('failed to authenticate to 192.168.1.5:37895');
    expect(result).toEqual({ ok: false, authError: true });
  });

  it('空输出按失败处理', () => {
    expect(parseConnectOutput('').ok).toBe(false);
    expect(parseConnectOutput(null).ok).toBe(false);
  });
});

describe('parseMdnsServices', () => {
  it('从行式输出提取 connect 服务地址并忽略 pairing 服务', () => {
    const output = [
      'List of mdns services:',
      '\tadb-1A2B3C-xYz\t_adb-tls-connect._tcp\t192.168.1.5:37895',
      '\tadb-1A2B3C-xYz\t_adb-tls-pairing._tcp\t192.168.1.5:37849',
      '',
    ].join('\n');
    expect(parseMdnsServices(output)).toEqual(['192.168.1.5:37895']);
  });

  it('兼容 track-services 结构化输出', () => {
    const output = [
      'tls {',
      'service {',
      'instance: "adb-35121FDJH000R8-xyMD0H"',
      'service: "_adb-tls-connect._tcp"',
      'ipv4: "192.168.84.23"',
      'port: 37895',
      'mdns_service_version: "2.0"',
      '}',
      '}',
    ].join('\n');
    expect(parseMdnsServices(output)).toEqual(['192.168.84.23:37895']);
  });

  it('空输出或无服务时返回空列表', () => {
    expect(parseMdnsServices('')).toEqual([]);
    expect(parseMdnsServices('List of mdns services:')).toEqual([]);
    expect(parseMdnsServices(null)).toEqual([]);
  });
});

describe('mergeWirelessDevices', () => {
  const stored = [
    { serial: '192.168.1.5:37895', model: 'Pixel 8' },
    { serial: '192.168.1.9:40001', model: '平板' },
  ];

  it('USB 设备原样保留，不附加无线标记', () => {
    const merged = mergeWirelessDevices(
      [{ serial: 'ABC123', state: 'device', model: 'Pixel 6 Pro' }],
      [],
    );
    expect(merged).toEqual([{ serial: 'ABC123', state: 'device', model: 'Pixel 6 Pro' }]);
  });

  it('在线无线设备标记 wireless 并回填已保存的机型名', () => {
    const merged = mergeWirelessDevices(
      [{ serial: '192.168.1.5:37895', state: 'device', model: '' }],
      [{ serial: '192.168.1.5:37895', model: 'Pixel 8' }],
    );
    expect(merged).toEqual([{
      serial: '192.168.1.5:37895',
      state: 'device',
      model: 'Pixel 8',
      wireless: true,
      connected: true,
      stored: true,
    }]);
  });

  it('离线的已保存设备以未连接状态追加，避免设备菜单丢失已配对设备', () => {
    const merged = mergeWirelessDevices([], stored);
    expect(merged).toEqual([
      {
        serial: '192.168.1.5:37895', state: 'offline', model: 'Pixel 8', wireless: true, connected: false, stored: true,
      },
      {
        serial: '192.168.1.9:40001', state: 'offline', model: '平板', wireless: true, connected: false, stored: true,
      },
    ]);
  });

  it('在线与离线不产生重复条目', () => {
    const merged = mergeWirelessDevices(
      [
        { serial: '192.168.1.5:37895', state: 'device', model: 'Pixel 8' },
        { serial: 'ABC123', state: 'device', model: 'Pixel 6 Pro' },
      ],
      stored,
    );
    const serials = merged.map((device) => device.serial);
    expect(new Set(serials).size).toBe(serials.length);
    expect(serials.filter((item) => item === '192.168.1.5:37895')).toHaveLength(1);
  });
});

describe('ensureWirelessConnected', () => {
  const adbPath = 'adb';

  const createAdb = ({ online = [], connectResults = {}, mdnsAddresses = [] } = {}) => ({
    listDevices: vi.fn().mockResolvedValue(online),
    connectDevice: vi.fn().mockImplementation((path, address) => {
      const result = connectResults[address];
      if (result instanceof Error) {
        return Promise.reject(result);
      }
      return Promise.resolve(result ?? 'cannot connect to address');
    }),
    getMdnsConnectAddresses: vi.fn().mockResolvedValue(mdnsAddresses),
  });

  it('设备已在线时直接返回，不再执行连接', async () => {
    const adb = createAdb({ online: [{ serial: '192.168.1.5:37895', state: 'device' }] });
    const result = await ensureWirelessConnected({
      serial: '192.168.1.5:37895',
      adbPath,
      adb,
    });
    expect(result).toEqual({ ok: true, serial: '192.168.1.5:37895' });
    expect(adb.connectDevice).not.toHaveBeenCalled();
  });

  it('按传入地址直连成功时不回报端口变化', async () => {
    const adb = createAdb({ connectResults: { '192.168.1.5:37895': 'connected to 192.168.1.5:37895' } });
    const result = await ensureWirelessConnected({
      serial: '192.168.1.5:37895',
      adbPath,
      adb,
    });
    expect(result).toEqual({ ok: true, serial: '192.168.1.5:37895' });
    expect(adb.getMdnsConnectAddresses).not.toHaveBeenCalled();
  });

  it('已存端口失效时用 mDNS 发现的新端口重连并回报 portChanged', async () => {
    const adb = createAdb({
      connectResults: { '192.168.1.5:41025': 'connected to 192.168.1.5:41025' },
      mdnsAddresses: ['192.168.1.5:41025'],
    });
    const result = await ensureWirelessConnected({
      serial: '192.168.1.5:37895',
      adbPath,
      adb,
    });
    expect(result).toEqual({ ok: true, serial: '192.168.1.5:41025', portChanged: true });
  });

  it('mDNS 发现的非同 IP 服务不会被用于重连', async () => {
    const adb = createAdb({
      mdnsAddresses: ['10.0.0.8:5555'],
    });
    const result = await ensureWirelessConnected({
      serial: '192.168.1.5:37895',
      adbPath,
      adb,
    });
    expect(result.ok).toBe(false);
    expect(adb.connectDevice).toHaveBeenCalledTimes(1);
  });

  it('全部尝试失败时返回指引性错误信息', async () => {
    const adb = createAdb({ mdnsAddresses: [] });
    const result = await ensureWirelessConnected({
      serial: '192.168.1.5:37895',
      adbPath,
      adb,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('端口可能已变化');
  });

  it('配对信息失效时错误信息提示重新配对', async () => {
    const adb = createAdb({
      connectResults: {
        '192.168.1.5:37895': 'failed to authenticate to 192.168.1.5:37895',
      },
      mdnsAddresses: [],
    });
    const result = await ensureWirelessConnected({
      serial: '192.168.1.5:37895',
      adbPath,
      adb,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('重新配对');
  });
});
