/**
 * scrcpy 媒体流解析器（视频/音频通用，scrcpy v5.0.1 demuxer.c 布局）。
 *
 * 流结构：
 *   [仅视频且 send_device_meta=true 时：64B 设备名]
 *   [4B codec id：ASCII 大端，如 "h264"/"opus"；全 0=流被禁用，全 1=设备端配置错误]
 *   [仅视频：12B 会话头，pts_flags 最高位=1，字节 4-7=宽、8-11=高，字节 3 最低位=client_resized]
 *   [12B 包头：u64 pts_flags（bit62=config、bit61=keyframe、低 62 位=pts 微秒）+ u32 负载长度][负载]...
 *
 * H.264/H.265 的 config 包（SPS/PPS）不单独交付，前置合并到下一个媒体包（与
 * scrcpy demuxer 的 packet merger 行为一致）后作为帧事件输出。
 */

import { Buffer } from 'node:buffer';

export const DEVICE_NAME_LENGTH = 64;
export const PACKET_HEADER_SIZE = 12;

export const PACKET_FLAG_SESSION = 1n << 63n;
export const PACKET_FLAG_CONFIG = 1n << 62n;
export const PACKET_FLAG_KEY_FRAME = 1n << 61n;
export const PACKET_PTS_MASK = PACKET_FLAG_KEY_FRAME - 1n;

// codec id 为 4 字节大端整数（scrcpy demuxer.c 的 SC_CODEC_ID_* 常量；短名高位补 0）
const CODEC_BY_ID = new Map([
  [0x68323634, 'h264'],
  [0x68323635, 'h265'],
  [0x00617631, 'av1'],
  [0x6f707573, 'opus'],
  [0x00616163, 'aac'],
  [0x666c6163, 'flac'],
  [0x00726177, 'raw'],
]);

const CONFIG_MERGE_CODECS = new Set(['h264', 'h265']);

/**
 * @typedef {object} MediaStreamEvent
 * @property {'codec'|'device-meta'|'session'|'frame'|'error'} kind - 事件类型。
 * @property {string} [codec] - kind=codec 时的编码名。
 * @property {string} [deviceName] - kind=device-meta 时的设备名。
 * @property {number} [width] - kind=session 时的视频宽。
 * @property {number} [height] - kind=session 时的视频高。
 * @property {boolean} [clientResized] - kind=session 时分辨率变化是否由 RESIZE_DISPLAY 触发。
 * @property {number} [pts] - kind=frame 时的微秒时间戳。
 * @property {boolean} [keyframe] - kind=frame 时是否关键帧。
 * @property {Buffer} [data] - kind=frame 时的负载（已合并 config）。
 * @property {string} [message] - kind=error 时的描述。
 */

export class MediaStreamParser {
  /**
   * @param {object} [options]
   * @param {boolean} [options.deviceMeta=false] - 流首部是否携带 64B 设备名（视频流）。
   * @param {boolean} [options.video=false] - 是否为视频流（携带会话头）。
   */
  constructor({ deviceMeta = false, video = false } = {}) {
    this.video = video;
    this.buffer = Buffer.alloc(0);
    this.pendingConfig = null;
    this.state = deviceMeta ? 'device-meta' : 'codec-id';
  }

  /**
   * 累积一段 TCP 数据，返回解析出的全部事件（可能为空）
   *
   * @param {Buffer|Uint8Array} chunk
   * @returns {MediaStreamEvent[]}
   */
  push(chunk) {
    const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.buffer = this.buffer.length === 0 ? incoming : Buffer.concat([this.buffer, incoming]);
    const events = [];
    for (;;) {
      const sizeBefore = this.buffer.length;
      const event = this.consumeOne();
      if (event) {
        events.push(event);
      }
      // 无事件且缓冲区无进展说明数据不足，等待下一次 push
      if (!event && this.buffer.length === sizeBefore) {
        break;
      }
    }
    return events;
  }

  /**
   * 按当前状态消费一次完整读取；数据不足时返回 null 等待下一次 push
   *
   * @returns {MediaStreamEvent|null}
   */
  consumeOne() {
    if (this.state === 'device-meta') {
      if (this.buffer.length < DEVICE_NAME_LENGTH) {
        return null;
      }
      const raw = this.buffer.subarray(0, DEVICE_NAME_LENGTH);
      this.buffer = this.buffer.subarray(DEVICE_NAME_LENGTH);
      this.state = 'codec-id';
      const end = raw.indexOf(0);
      return { kind: 'device-meta', deviceName: raw.subarray(0, end === -1 ? 63 : Math.min(end, 63)).toString('utf8') };
    }

    if (this.state === 'codec-id') {
      if (this.buffer.length < 4) {
        return null;
      }
      const code = this.buffer.readUInt32BE(0);
      this.buffer = this.buffer.subarray(4);
      if (code === 0x00000000) {
        return { kind: 'error', message: '设备侧已禁用该流（codec id = 0）' };
      }
      if (code === 0x00000001) {
        return { kind: 'error', message: '设备端流配置错误（codec id = 1）' };
      }
      const codec = CODEC_BY_ID.get(code);
      if (!codec) {
        return { kind: 'error', message: `未知编码: 0x${code.toString(16).padStart(8, '0')}` };
      }
      this.state = this.video ? 'session' : 'frame-header';
      this.mergeConfig = CONFIG_MERGE_CODECS.has(codec);
      return { kind: 'codec', codec };
    }

    if (this.state === 'session') {
      if (this.buffer.length < PACKET_HEADER_SIZE) {
        return null;
      }
      const header = this.buffer.subarray(0, PACKET_HEADER_SIZE);
      this.buffer = this.buffer.subarray(PACKET_HEADER_SIZE);
      this.state = 'frame-header';
      return {
        kind: 'session',
        width: header.readUInt32BE(4),
        height: header.readUInt32BE(8),
        clientResized: (header[3] & 1) === 1,
      };
    }

    // frame-header
    if (this.buffer.length < PACKET_HEADER_SIZE) {
      return null;
    }
    const ptsFlags = this.buffer.readBigUInt64BE(0);
    if ((ptsFlags & PACKET_FLAG_SESSION) !== 0n) {
      // 分辨率/方向变化的会话包只有 12B 头：字节 4-7=宽、8-11=高（长度字段位置即高度）
      const header = this.buffer.subarray(0, PACKET_HEADER_SIZE);
      this.buffer = this.buffer.subarray(PACKET_HEADER_SIZE);
      this.state = 'frame-header';
      return {
        kind: 'session',
        width: header.readUInt32BE(4),
        height: header.readUInt32BE(8),
        clientResized: (header[3] & 1) === 1,
      };
    }
    const length = this.buffer.readUInt32BE(8);
    if (length === 0) {
      // 消费掉 12B 头再报错，避免同一数据反复产出错误事件
      this.buffer = this.buffer.subarray(PACKET_HEADER_SIZE);
      return { kind: 'error', message: '非法媒体包长度 0' };
    }
    if (this.buffer.length < PACKET_HEADER_SIZE + length) {
      return null;
    }
    const payload = this.buffer.subarray(PACKET_HEADER_SIZE, PACKET_HEADER_SIZE + length);
    this.buffer = this.buffer.subarray(PACKET_HEADER_SIZE + length);
    this.state = 'frame-header';

    const keyframe = (ptsFlags & PACKET_FLAG_KEY_FRAME) !== 0n;
    if ((ptsFlags & PACKET_FLAG_CONFIG) !== 0n) {
      if (!this.mergeConfig) {
        return null;
      }
      this.pendingConfig = Buffer.from(payload);
      return null;
    }
    const data = this.pendingConfig && this.mergeConfig
      ? Buffer.concat([this.pendingConfig, Buffer.from(payload)])
      : Buffer.from(payload);
    this.pendingConfig = null;
    return {
      kind: 'frame',
      pts: Number(ptsFlags & PACKET_PTS_MASK),
      keyframe,
      data,
    };
  }
}
