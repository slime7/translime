import { describe, expect, it } from 'vitest';
import {
  buildServerCommand,
  buildServerParams,
  formatScid,
  SERVER_DEVICE_PATH,
  SERVER_ENTRY_CLASS,
  SERVER_VERSION,
  socketNameForScid,
} from '../src/server/server-args';

describe('formatScid / socketNameForScid', () => {
  it('scid 格式化为 8 位小写十六进制并与 socket 命名一致', () => {
    expect(formatScid(0x1a2b)).toBe('00001a2b');
    expect(socketNameForScid(0x1a2b)).toBe('scrcpy_00001a2b');
    expect(socketNameForScid(0x7fffffff)).toBe('scrcpy_7fffffff');
  });
});

describe('buildServerParams', () => {
  it('基础参数显式声明版本相关元数据开关与 reverse 方向', () => {
    const params = buildServerParams({ scid: 0x1a2b });
    expect(params).toContain('scid=00001a2b');
    expect(params).toContain('video_codec=h264');
    expect(params).toContain('audio=true');
    expect(params).toContain('send_frame_meta=true');
    expect(params).toContain('send_stream_meta=true');
    expect(params).toContain('send_device_meta=true');
    expect(params).toContain('tunnel_forward=false');
    expect(params.some((p) => p.startsWith('max_size='))).toBe(false);
    expect(params.some((p) => p.startsWith('new_display='))).toBe(false);
  });

  it('可选参数仅在有效时输出', () => {
    const params = buildServerParams({
      scid: 1,
      videoCodec: 'h265',
      audio: false,
      maxSize: 1600,
      maxFps: 60,
      newDisplay: '871x1184',
      flexDisplay: true,
    });
    expect(params).toContain('video_codec=h265');
    expect(params).toContain('audio=false');
    expect(params).toContain('max_size=1600');
    expect(params).toContain('max_fps=60');
    expect(params).toContain('new_display=871x1184');
    expect(params).toContain('flex_display=true');
  });
});

describe('buildServerCommand', () => {
  it('按 scrcpy v5 约定构造 app_process 命令行', () => {
    const command = buildServerCommand({ scid: 0x1a2b });
    expect(command[0]).toBe('shell');
    expect(command[1]).toBe(`CLASSPATH=${SERVER_DEVICE_PATH}`);
    expect(command[2]).toBe('app_process');
    expect(command[3]).toBe('/');
    expect(command[4]).toBe(SERVER_ENTRY_CLASS);
    // args[0] 必须与 server 内置版本严格一致，否则设备端立即退出
    expect(command[5]).toBe(SERVER_VERSION);
    expect(command.slice(6)).toEqual(buildServerParams({ scid: 0x1a2b }));
  });
});
