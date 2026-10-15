import {
  describe, expect, it, vi,
} from 'vitest';
import scanOpenPorts from '../src/port-scan';

describe('scanOpenPorts', () => {
  it('返回升序的开放端口，且每个候选端口都被探测', async () => {
    const probe = vi.fn((host, port) => Promise.resolve(port === 40001 || port === 32769));
    const open = await scanOpenPorts({
      host: '192.168.1.5',
      ports: [32768, 32769, 40001, 50000],
      probe,
    });
    expect(open).toEqual([32769, 40001]);
    expect(probe).toHaveBeenCalledTimes(4);
    expect(probe.mock.calls.every((call) => call[0] === '192.168.1.5')).toBe(true);
  });

  it('全部端口探测失败时返回空列表', async () => {
    const open = await scanOpenPorts({
      host: '192.168.1.5',
      ports: [1, 2, 3],
      probe: () => Promise.resolve(false),
    });
    expect(open).toEqual([]);
  });

  it('探测抛错按端口关闭处理，不中断扫描', async () => {
    const probe = vi.fn((host, port) => (port === 2
      ? Promise.reject(new Error('boom'))
      : Promise.resolve(port === 3)));
    const open = await scanOpenPorts({
      host: '192.168.1.5',
      ports: [1, 2, 3],
      probe,
    });
    expect(open).toEqual([3]);
  });
});
