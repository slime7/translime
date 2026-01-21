import {
  describe, expect, it,
} from 'vitest';
import { parseAppArgv, parseDeepLink } from '@main/utils';

describe('parseAppArgv', () => {
  it('空参数数组应返回空对象', () => {
    const result = parseAppArgv([]);
    expect(result).toEqual({});
  });

  it('少于两个参数应返回空对象', () => {
    const result = parseAppArgv(['app.exe']);
    expect(result).toEqual({});
  });

  it('应正确解析应用路径', () => {
    const result = parseAppArgv(['app.exe', 'extra']);
    expect(result.app).toBe('app.exe');
  });

  it('应正确解析 translime: URL', () => {
    const result = parseAppArgv(['app.exe', 'translime://open?foo=bar']);
    expect(result.url).toBe('translime://open?foo=bar');
  });

  it('应正确解析 --key=value 格式参数', () => {
    const result = parseAppArgv(['app.exe', '--port=3000', '--host=localhost']);
    expect(result.port).toBe('3000');
    expect(result.host).toBe('localhost');
  });

  it('--key=false 应返回 false 布尔值', () => {
    const result = parseAppArgv(['app.exe', '--debug=false']);
    expect(result.debug).toBe(false);
  });

  it('应正确解析 --key 布尔标志', () => {
    const result = parseAppArgv(['app.exe', '--verbose']);
    expect(result.verbose).toBe(true);
  });

  it('额外参数应存入 extra 数组', () => {
    const result = parseAppArgv(['app.exe', 'file1.txt', 'file2.txt']);
    expect(result.extra).toEqual(['file1.txt', 'file2.txt']);
  });

  it('应正确处理混合参数', () => {
    const result = parseAppArgv([
      'app.exe',
      '--debug',
      'translime://open',
      '--port=8080',
      'extra.txt',
    ]);
    expect(result.app).toBe('app.exe');
    expect(result.debug).toBe(true);
    expect(result.url).toBe('translime://open');
    expect(result.port).toBe('8080');
    expect(result.extra).toContain('extra.txt');
  });

  it('空的 --key= 应该被忽略', () => {
    const result = parseAppArgv(['app.exe', '--=value']);
    expect(result['']).toBeUndefined();
  });
});

describe('parseDeepLink', () => {
  it('空 URL 应返回空对象', () => {
    const result = parseDeepLink('');
    expect(result).toEqual({});
  });

  it('null URL 应返回空对象', () => {
    const result = parseDeepLink(null);
    expect(result).toEqual({});
  });

  it('undefined URL 应返回空对象', () => {
    const result = parseDeepLink(undefined);
    expect(result).toEqual({});
  });

  it('应正确解析 hostname 为 main', () => {
    const result = parseDeepLink('translime://open');
    expect(result.main).toBe('open');
  });

  it('应保留原始 URL 在 origin 字段', () => {
    const url = 'translime://open?foo=bar';
    const result = parseDeepLink(url);
    expect(result.origin).toBe(url);
  });

  it('应正确解析 searchParams 为 params', () => {
    const result = parseDeepLink('translime://open?foo=bar&baz=qux');
    expect(result.params).toEqual({
      foo: 'bar',
      baz: 'qux',
    });
  });

  it('无查询参数时 params 应为空对象', () => {
    const result = parseDeepLink('translime://plugin');
    expect(result.params).toEqual({});
  });

  it('应正确处理 URL 编码的参数', () => {
    const result = parseDeepLink('translime://open?name=%E6%B5%8B%E8%AF%95');
    expect(result.params.name).toBe('测试');
  });
});
