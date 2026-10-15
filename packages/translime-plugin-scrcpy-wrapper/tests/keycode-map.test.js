import { describe, expect, it } from 'vitest';
import { keycodeForCode, metaStateForEvent } from '../src/ui/wrapper/keycode-map';
import { toVideoPoint } from '../src/ui/wrapper/wrapper-input';

describe('keycodeForCode', () => {
  it('覆盖字母、数字与常用控制键', () => {
    expect(keycodeForCode('KeyA')).toBe(29);
    expect(keycodeForCode('KeyZ')).toBe(54);
    expect(keycodeForCode('Digit0')).toBe(7);
    expect(keycodeForCode('Digit9')).toBe(16);
    expect(keycodeForCode('Enter')).toBe(66);
    expect(keycodeForCode('Backspace')).toBe(67);
    expect(keycodeForCode('Escape')).toBe(111);
    expect(keycodeForCode('ArrowUp')).toBe(19);
    expect(keycodeForCode('F1')).toBe(131);
    expect(keycodeForCode('ControlLeft')).toBe(129);
  });

  it('无映射的 code 返回 null（由调用方回落文本注入）', () => {
    expect(keycodeForCode('IntlRo')).toBeNull();
    expect(keycodeForCode('Unidentified')).toBeNull();
  });
});

describe('metaStateForEvent', () => {
  it('按事件修饰键合成 Android META 掩码', () => {
    expect(metaStateForEvent({})).toBe(0);
    expect(metaStateForEvent({ shiftKey: true })).toBe(0x1);
    expect(metaStateForEvent({ ctrlKey: true, altKey: true })).toBe(0x1000 | 0x2);
    expect(metaStateForEvent({ metaKey: true })).toBe(0x10000);
  });
});

describe('toVideoPoint', () => {
  const canvas = {
    getBoundingClientRect: () => ({
      left: 10, top: 20, width: 100, height: 200,
    }),
  };
  const videoSize = { width: 1080, height: 2400 };

  it('按 canvas 与视频尺寸比例换算坐标', () => {
    expect(toVideoPoint({ clientX: 60, clientY: 120 }, canvas, videoSize)).toEqual({ x: 540, y: 1200 });
  });

  it('越界坐标钳制到视频范围内', () => {
    expect(toVideoPoint({ clientX: -50, clientY: 999 }, canvas, videoSize)).toEqual({ x: 0, y: 2399 });
    expect(toVideoPoint({ clientX: 999, clientY: 0 }, canvas, videoSize)).toEqual({ x: 1079, y: 0 });
  });

  it('canvas 尺寸异常时返回原点，不抛错', () => {
    const zero = {
      getBoundingClientRect: () => ({
        left: 0, top: 0, width: 0, height: 0,
      }),
    };
    expect(toVideoPoint({ clientX: 5, clientY: 5 }, zero, videoSize)).toEqual({ x: 0, y: 0 });
  });
});
