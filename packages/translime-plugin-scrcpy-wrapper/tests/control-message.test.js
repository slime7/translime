import { describe, expect, it } from 'vitest';
import {
  backOrScreenOn,
  ControlReplyParser,
  encodeControlMessage,
  getClipboard,
  injectKeycode,
  injectScroll,
  injectText,
  injectTouch,
  resizeDisplay,
  setClipboard,
  startApp,
} from '../src/server/control-message';

describe('injectKeycode', () => {
  it('按大端布局编码：类型+action+keycode+repeat+metaState', () => {
    expect(injectKeycode({
      action: 0, keycode: 4, repeat: 0, metaState: 0,
    })).toEqual(
      Buffer.from([0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0]),
    );
    expect(injectKeycode({
      action: 1, keycode: 66, repeat: 0, metaState: 1,
    })).toEqual(
      Buffer.from([0, 1, 0, 0, 0, 66, 0, 0, 0, 0, 0, 0, 0, 1]),
    );
  });
});

describe('injectTouch', () => {
  it('鼠标 pointerId=-1 编码为 u64 最大值，pressure 1.0 为 0xffff', () => {
    const buf = injectTouch({
      action: 0,
      pointerId: -1,
      x: 100,
      y: 200,
      videoWidth: 1080,
      videoHeight: 2400,
      pressure: 1,
    });
    expect(buf.length).toBe(32);
    expect(buf.readUInt8(0)).toBe(2);
    expect(buf.readUInt8(1)).toBe(0);
    expect(buf.readBigUInt64BE(2)).toBe(0xffffffffffffffffn);
    expect(buf.readInt32BE(10)).toBe(100);
    expect(buf.readInt32BE(14)).toBe(200);
    expect(buf.readUInt16BE(18)).toBe(1080);
    expect(buf.readUInt16BE(20)).toBe(2400);
    expect(buf.readUInt16BE(22)).toBe(0xffff);
    expect(buf.readInt32BE(24)).toBe(0);
    expect(buf.readInt32BE(28)).toBe(0);
  });

  it('多点时仍发送基础 action（index 由设备端按 pointerId 合成）', () => {
    const buf = injectTouch({
      action: 0,
      pointerId: 1,
      x: 0,
      y: 0,
      videoWidth: 1080,
      videoHeight: 2400,
      pressure: 0.5,
    });
    expect(buf.readUInt8(1)).toBe(0);
    // 0.5 * 0x10000 = 0x8000
    expect(buf.readUInt16BE(22)).toBe(0x8000);
  });
});

describe('injectScroll', () => {
  it('滚动值按 /16 编码 i16 定点（一格滚轮 = ±2048）', () => {
    const buf = injectScroll({
      x: 10,
      y: 20,
      videoWidth: 1080,
      videoHeight: 2400,
      hscroll: 0,
      vscroll: 1,
    });
    expect(buf.length).toBe(21);
    expect(buf.readUInt8(0)).toBe(3);
    expect(buf.readInt32BE(1)).toBe(10);
    expect(buf.readInt32BE(5)).toBe(20);
    expect(buf.readUInt16BE(9)).toBe(1080);
    expect(buf.readUInt16BE(11)).toBe(2400);
    expect(buf.readInt16BE(13)).toBe(0);
    expect(buf.readInt16BE(15)).toBe(2048);
  });

  it('范围外的滚动值被钳制到 [-1,1]（编码前已除以 16）', () => {
    const buf = injectScroll({
      x: 0,
      y: 0,
      videoWidth: 100,
      videoHeight: 100,
      hscroll: -99,
      vscroll: 99,
    });
    expect(buf.readInt16BE(13)).toBe(-32768);
    expect(buf.readInt16BE(15)).toBe(32767);
  });
});

describe('injectText', () => {
  it('UTF-8 文本带 4 字节长度前缀', () => {
    const buf = injectText('中');
    expect(buf).toEqual(Buffer.concat([Buffer.from([1, 0, 0, 0, 3]), Buffer.from('中', 'utf8')]));
  });

  it('超长文本截断到 300 字节且不破坏多字节字符', () => {
    const buf = injectText('中'.repeat(200));
    const length = buf.readUInt32BE(1);
    expect(length).toBe(300);
    expect(buf.length).toBe(5 + 300);
    // 300 = 100 个完整汉字
    expect(buf.subarray(5).toString('utf8')).toBe('中'.repeat(100));
  });
});

describe('剪贴板与简单消息', () => {
  it('setClipboard：sequence + paste + 长度前缀文本', () => {
    const buf = setClipboard({ text: 'hi', paste: true, sequence: 7n });
    expect(buf.subarray(0, 9)).toEqual(Buffer.from([9, 0, 0, 0, 0, 0, 0, 0, 7]));
    expect(buf[9]).toBe(1);
    expect(buf.readUInt32BE(10)).toBe(2);
    expect(buf.subarray(14).toString()).toBe('hi');
  });

  it('getClipboard / backOrScreenOn / startApp / resizeDisplay 布局', () => {
    expect(getClipboard()).toEqual(Buffer.from([8, 0]));
    expect(backOrScreenOn(1)).toEqual(Buffer.from([4, 1]));
    expect(startApp('com.foo')).toEqual(Buffer.from([16, 7, ...Buffer.from('com.foo')]));
    expect(resizeDisplay(1920, 1080)).toEqual(Buffer.from([21, 0x07, 0x80, 0x04, 0x38]));
  });
});

describe('encodeControlMessage', () => {
  it('按 type 分发到对应编码器', () => {
    expect(encodeControlMessage({ type: 'back', action: 0 })).toEqual(backOrScreenOn(0));
    expect(encodeControlMessage({ type: 'resize-display', width: 100, height: 200 })).toEqual(resizeDisplay(100, 200));
    expect(encodeControlMessage({ type: 'text', text: 'a' })).toEqual(injectText('a'));
  });

  it('未知类型抛出带类型名的错误', () => {
    expect(() => encodeControlMessage({ type: 'nope' })).toThrow('nope');
    expect(() => encodeControlMessage(null)).toThrow();
  });
});

describe('ControlReplyParser', () => {
  it('解析剪贴板回包并容忍 TCP 分片', () => {
    const parser = new ControlReplyParser();
    const frame = Buffer.concat([Buffer.from([0, 0, 0, 0, 6]), Buffer.from('你好')]);
    expect(parser.push(frame.subarray(0, 3))).toEqual([]);
    expect(parser.push(frame.subarray(3))).toEqual([{ type: 'clipboard', text: '你好' }]);
  });

  it('非剪贴板类型忽略，长度不足时等待后续数据', () => {
    const parser = new ControlReplyParser();
    const other = Buffer.from([5, 0, 0, 0, 1, 0x61]);
    expect(parser.push(other)).toEqual([]);
    expect(parser.push(Buffer.from([0, 0]))).toEqual([]);
    // 补足 [type=0][len=1]['b'] 的剩余部分
    expect(parser.push(Buffer.from([0, 0, 1, 0x62]))).toEqual([{ type: 'clipboard', text: 'b' }]);
  });
});
