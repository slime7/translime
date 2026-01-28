import {
  describe, expect, it, vi,
} from 'vitest';
import {
  apiError, getUuiD, randomNumber, wait,
} from '@share/utils';

describe('wait', () => {
  it('应该在指定时间后 resolve', async () => {
    vi.useFakeTimers();
    const promise = wait(1);

    // 快进 1 秒
    vi.advanceTimersByTime(1000);

    await expect(promise).resolves.toBe(true);
    vi.useRealTimers();
  });

  it('应该正确处理不同的等待时间', async () => {
    vi.useFakeTimers();
    const promise = wait(2);

    // 快进不足的时间，promise 不应该 resolve
    vi.advanceTimersByTime(1000);

    // 再快进 1 秒
    vi.advanceTimersByTime(1000);

    await expect(promise).resolves.toBe(true);
    vi.useRealTimers();
  });
});

describe('apiError', () => {
  it('应该将字符串转换为 Error 对象', () => {
    const result = apiError('测试错误');

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('测试错误');
  });

  it('应该为 Error 对象附加额外属性', () => {
    const originalError = new Error('原始错误');
    const result = apiError(originalError, {
      code: 500,
      status: 'error',
    });

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('原始错误');
    expect(result.code).toBe(500);
    expect(result.status).toBe('error');
  });

  it('应该保留原始错误的所有属性', () => {
    const originalError = new Error('测试');
    originalError.customProp = 'custom';

    const result = apiError(originalError, { newProp: 'new' });

    expect(result.customProp).toBe('custom');
    expect(result.newProp).toBe('new');
  });

  it('空附加数据时应该正常工作', () => {
    const error = new Error('测试');
    const result = apiError(error);

    expect(result).toBe(error);
  });
});

describe('randomNumber', () => {
  it('单参数模式：应该返回 0 到 n 之间的数字', () => {
    for (let i = 0; i < 100; i += 1) {
      const result = randomNumber(10);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(10);
    }
  });

  it('双参数模式：应该返回 start 到 end 之间的数字', () => {
    for (let i = 0; i < 100; i += 1) {
      const result = randomNumber(5, 15);
      expect(result).toBeGreaterThanOrEqual(5);
      expect(result).toBeLessThanOrEqual(15);
    }
  });

  it('应该返回整数', () => {
    const result = randomNumber(1, 100);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe('getUuiD', () => {
  it('应该返回字符串', () => {
    const result = getUuiD();
    expect(typeof result).toBe('string');
  });

  it('应该返回非空字符串', () => {
    const result = getUuiD();
    expect(result.length).toBeGreaterThan(0);
  });

  it('多次调用应该返回不同的值（高概率）', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i += 1) {
      ids.add(getUuiD());
    }
    // 100 次调用应该产生至少 95 个不同的 ID
    expect(ids.size).toBeGreaterThanOrEqual(95);
  });

  it('应该接受自定义长度参数', () => {
    // getUuiD 的实现使用了随机数和时间戳的组合
    // 不同长度参数会影响最终结果
    const id1 = getUuiD(4);
    const id2 = getUuiD(12);

    expect(typeof id1).toBe('string');
    expect(typeof id2).toBe('string');
  });
});
