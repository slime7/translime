import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import {
  MediaStreamParser,
  PACKET_FLAG_CONFIG,
  PACKET_FLAG_KEY_FRAME,
} from '../src/server/video-frame-parser';

const deviceMeta = () => {
  const meta = Buffer.alloc(64);
  Buffer.from('Pixel 8', 'utf8').copy(meta);
  return meta;
};

const codecId = (name) => Buffer.from(name.padStart(4, '\0'), 'latin1');

/** 12B 会话头：MSB=1，字节 3 最低位=clientResized，字节 4-7=宽，8-11=高 */
const sessionPacket = (width, height, clientResized = false) => {
  const header = Buffer.alloc(12);
  header.writeBigUInt64BE(1n << 63n, 0);
  if (clientResized) {
    header[3] |= 1;
  }
  header.writeUInt32BE(width, 4);
  header.writeUInt32BE(height, 8);
  return header;
};

/** 12B 包头 + 负载 */
const mediaPacket = ({
  pts = 0n, config = false, keyframe = false, payload,
}) => {
  let flags = pts & ((1n << 61n) - 1n);
  if (config) {
    flags |= PACKET_FLAG_CONFIG;
  }
  if (keyframe) {
    flags |= PACKET_FLAG_KEY_FRAME;
  }
  const header = Buffer.alloc(12);
  header.writeBigUInt64BE(flags, 0);
  header.writeUInt32BE(payload.length, 8);
  return Buffer.concat([header, payload]);
};

const VIDEO_SETUP = Buffer.concat([
  deviceMeta(),
  codecId('h264'),
  sessionPacket(1080, 2400),
]);

describe('MediaStreamParser', () => {
  it('完整解析设备名、编码、会话头与关键帧', () => {
    const parser = new MediaStreamParser({ deviceMeta: true, video: true });
    const events = parser.push(Buffer.concat([
      VIDEO_SETUP,
      mediaPacket({ pts: 16000n, keyframe: true, payload: Buffer.from([1, 2, 3]) }),
    ]));
    expect(events.map((e) => e.kind)).toEqual(['device-meta', 'codec', 'session', 'frame']);
    expect(events[0].deviceName).toBe('Pixel 8');
    expect(events[1].codec).toBe('h264');
    expect(events[2]).toEqual({
      kind: 'session', width: 1080, height: 2400, clientResized: false,
    });
    expect(events[3]).toEqual({
      kind: 'frame', pts: 16000, keyframe: true, data: Buffer.from([1, 2, 3]),
    });
  });

  it('TCP 分片不打断解析', () => {
    const parser = new MediaStreamParser({ deviceMeta: true, video: true });
    const stream = Buffer.concat([
      VIDEO_SETUP,
      mediaPacket({ pts: 33000n, keyframe: true, payload: Buffer.alloc(100, 7) }),
      mediaPacket({ pts: 49666n, payload: Buffer.alloc(50, 9) }),
    ]);
    const events = [];
    for (let i = 0; i < stream.length; i += 7) {
      events.push(...parser.push(stream.subarray(i, i + 7)));
    }
    expect(events.map((e) => e.kind)).toEqual(['device-meta', 'codec', 'session', 'frame', 'frame']);
    expect(events[3].keyframe).toBe(true);
    expect(events[4].keyframe).toBe(false);
  });

  it('config 包前置合并到下一个关键帧，不单独产出事件', () => {
    const parser = new MediaStreamParser({ video: true });
    parser.push(codecId('h264'));
    const sps = Buffer.from([0x67, 0x64]);
    const idr = Buffer.from([0x65, 0x11]);
    const events = parser.push(Buffer.concat([
      sessionPacket(1080, 2400),
      mediaPacket({ config: true, payload: sps }),
      mediaPacket({ pts: 16000n, keyframe: true, payload: idr }),
      mediaPacket({ pts: 33000n, payload: Buffer.from([0x41]) }),
    ]));
    expect(events.length).toBe(3);
    expect(events[0].kind).toBe('session');
    expect(events[1]).toEqual({
      kind: 'frame', pts: 16000, keyframe: true, data: Buffer.concat([sps, idr]),
    });
    expect(events[2].data).toEqual(Buffer.from([0x41]));
  });

  it('流中出现会话头表示分辨率/方向变化，仅消费 12 字节', () => {
    const parser = new MediaStreamParser({ video: true });
    parser.push(codecId('h264'));
    parser.push(sessionPacket(1080, 2400));
    const events = parser.push(Buffer.concat([
      sessionPacket(2400, 1080, true),
      mediaPacket({ pts: 16000n, keyframe: true, payload: Buffer.from([1]) }),
    ]));
    expect(events[0]).toEqual({
      kind: 'session', width: 2400, height: 1080, clientResized: true,
    });
    expect(events[1].kind).toBe('frame');
  });

  it('音频流无设备名与会话头，直接从 codec 进入帧', () => {
    const parser = new MediaStreamParser({ deviceMeta: false, video: false });
    const events = parser.push(Buffer.concat([
      codecId('opus'),
      mediaPacket({ pts: 96000n, payload: Buffer.from([0xfc]) }),
    ]));
    expect(events.map((e) => e.kind)).toEqual(['codec', 'frame']);
    expect(events[1].data).toEqual(Buffer.from([0xfc]));
  });

  it('h265 的 config 同样合并，av1/opus 不合并', () => {
    const h265 = new MediaStreamParser({ video: true });
    h265.push(codecId('h265'));
    h265.push(sessionPacket(100, 100));
    const vps = Buffer.from([0x40, 0x01]);
    const events = h265.push(Buffer.concat([
      mediaPacket({ config: true, payload: vps }),
      mediaPacket({ pts: 1n, keyframe: true, payload: Buffer.from([2]) }),
    ]));
    expect(events[0].data).toEqual(Buffer.concat([vps, Buffer.from([2])]));

    const av1 = new MediaStreamParser({ video: true });
    av1.push(codecId('av1'));
    av1.push(sessionPacket(100, 100));
    const av1Events = av1.push(Buffer.concat([
      mediaPacket({ config: true, payload: Buffer.from([0x0a]) }),
      mediaPacket({ pts: 1n, keyframe: true, payload: Buffer.from([0x0b]) }),
    ]));
    expect(av1Events[0].data).toEqual(Buffer.from([0x0b]));
  });

  it('codec id 0/1 表示流禁用或配置错误，产出 error 事件', () => {
    const disabled = new MediaStreamParser({ video: false });
    expect(disabled.push(Buffer.from([0, 0, 0, 0]))).toEqual([
      { kind: 'error', message: expect.stringContaining('禁用') },
    ]);
    const broken = new MediaStreamParser({ video: false });
    expect(broken.push(Buffer.from([0, 0, 0, 1]))).toEqual([
      { kind: 'error', message: expect.stringContaining('配置错误') },
    ]);
  });

  it('非法包长度产出 error 事件', () => {
    const parser = new MediaStreamParser({ video: false });
    parser.push(codecId('opus'));
    const header = Buffer.alloc(12);
    header.writeBigUInt64BE(0n, 0);
    header.writeUInt32BE(0, 8);
    expect(parser.push(header)).toEqual([
      { kind: 'error', message: expect.stringContaining('长度') },
    ]);
  });
});
