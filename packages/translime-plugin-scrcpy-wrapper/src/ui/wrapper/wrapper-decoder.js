/**
 * WebCodecs 视频解码渲染：Annex B 裸流 → VideoDecoder → canvas。
 *
 * 数据来自主进程转发的 scrcpy 媒体事件（session/video），config 包（SPS/PPS）
 * 已由主进程合并进关键帧，这里无需处理 description。
 */

// Chromium 接受合法的 codec 串即可，实际 profile/level 以流内 SPS 为准
const CODEC_STRING = {
  h264: 'avc1.640034',
  h265: 'hvc1.1.6.L153.B0',
};

// 解码积压超过该帧数时丢弃非关键帧，避免网络抖动后延迟持续累积
const MAX_PENDING_FRAMES = 10;

export default class ScrcpyVideoRenderer {
  /**
   * @param {object} options
   * @param {HTMLCanvasElement} options.canvas - 目标画布。
   * @param {(message: string) => void} [options.onError] - 解码错误回调。
   */
  constructor({ canvas, onError = () => {} }) {
    this.canvas = canvas;
    this.onError = onError;
    this.ctx = canvas.getContext('2d');
    this.codec = null;
    this.decoder = null;
    this.waitKey = true;
    this.lastTimestamp = 0;
    this.pendingFrame = null;
    this.rafId = 0;
    this.destroyed = false;
    this.renderLoop();
  }

  renderLoop = () => {
    if (this.destroyed) {
      return;
    }
    if (this.pendingFrame) {
      const frame = this.pendingFrame;
      this.pendingFrame = null;
      this.ctx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
      frame.close();
    }
    this.rafId = requestAnimationFrame(this.renderLoop);
  };

  /** @param {string} codec - 'h264' | 'h265' */
  handleCodec = (codec) => {
    this.codec = codec;
  };

  /**
   * 会话头：更新画布尺寸并（重）建解码器
   *
   * @param {object} options
   * @param {number} options.width
   * @param {number} options.height
   */
  handleSession = ({ width, height }) => {
    if (this.destroyed || !this.codec) {
      return;
    }
    this.canvas.width = width;
    this.canvas.height = height;
    this.decoder?.close();
    this.decoder = new VideoDecoder({
      output: (frame) => {
        this.pendingFrame?.close();
        this.pendingFrame = frame;
      },
      error: (e) => {
        this.onError(`视频解码失败：${e.message}`);
      },
    });
    this.decoder.configure({
      codec: CODEC_STRING[this.codec] ?? this.codec,
      optimizeForLatency: true,
    });
    this.waitKey = true;
  };

  /**
   * 喂入一帧（Annex B；关键帧已含 config）
   *
   * @param {object} options
   * @param {boolean} options.keyframe
   * @param {number} options.pts - 微秒时间戳。
   * @param {Uint8Array} options.data
   */
  handleFrame = ({ keyframe, pts, data }) => {
    if (this.destroyed || !this.decoder) {
      return;
    }
    if (this.waitKey) {
      if (!keyframe) {
        return;
      }
      this.waitKey = false;
    }
    if (!keyframe && this.decoder.decodeQueueSize > MAX_PENDING_FRAMES) {
      return;
    }
    // 编码器重启后 pts 可能回退，保证 chunk 时间戳单调
    const timestamp = pts >= this.lastTimestamp ? pts : this.lastTimestamp + 33366;
    this.lastTimestamp = timestamp;
    this.decoder.decode(new EncodedVideoChunk({
      type: keyframe ? 'key' : 'delta',
      timestamp,
      data,
    }));
  };

  /** @returns {boolean} 是否不支持所选编码的硬解 */
  async isCodecSupported() {
    if (!this.codec) {
      return false;
    }
    try {
      const support = await VideoDecoder.isConfigSupported({
        codec: CODEC_STRING[this.codec] ?? this.codec,
        optimizeForLatency: true,
      });
      return support.supported === true;
    } catch {
      return false;
    }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
    this.pendingFrame?.close();
    this.pendingFrame = null;
    try {
      this.decoder?.close();
    } catch {
      // 解码器可能已关闭
    }
    this.decoder = null;
  }
}
