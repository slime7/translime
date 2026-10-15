/**
 * WebCodecs 音频解码播放：scrcpy Opus 裸包 → AudioDecoder → AudioContext 调度。
 *
 * scrcpy 音频为 48kHz 立体声裸 Opus 包（无容器、无会话头）；解码出的 AudioData
 * 转 AudioBuffer 后按播放时钟排队：积压过多丢帧、落后过多重置，避免延迟累积。
 * AudioContext 可能因自动播放策略处于 suspended，需在用户手势后 resume。
 */

const TARGET_AHEAD_SECONDS = 0.08;
const MAX_AHEAD_SECONDS = 0.6;
const RESET_BEHIND_SECONDS = 0.25;

export default class ScrcpyAudioPlayer {
  /**
   * @param {object} [options]
   * @param {(message: string) => void} [options.onError]
   */
  constructor({ onError = () => {} } = {}) {
    this.onError = onError;
    this.decoder = null;
    this.context = null;
    this.nextTime = 0;
    this.destroyed = false;
  }

  /** @param {string} codec - 'opus' 时才启用，其余编码忽略并提示 */
  handleCodec = (codec) => {
    if (this.destroyed) {
      return;
    }
    if (codec !== 'opus') {
      this.onError(`暂不支持的音频编码: ${codec}，已静音`);
      return;
    }
    try {
      this.decoder = new AudioDecoder({
        output: (audioData) => this.schedule(audioData),
        error: (e) => this.onError(`音频解码失败：${e.message}`),
      });
      this.decoder.configure({
        codec: 'opus',
        sampleRate: 48000,
        numberOfChannels: 2,
      });
    } catch (e) {
      this.onError(`音频解码器初始化失败：${e.message}`);
    }
  };

  /**
   * 喂入一个音频包（裸 Opus packet）
   *
   * @param {object} options
   * @param {number} options.pts - 微秒时间戳。
   * @param {Uint8Array} options.data
   */
  handleFrame = ({ pts, data }) => {
    if (this.destroyed || !this.decoder || this.decoder.state !== 'configured') {
      return;
    }
    try {
      this.decoder.decode(new EncodedAudioChunk({
        type: 'key',
        timestamp: pts,
        data,
      }));
    } catch {
      // 单包异常不中断音频流
    }
  };

  /**
   * 把解码输出的 AudioData 按播放时钟调度到 AudioContext
   *
   * @param {AudioData} audioData
   */
  schedule = (audioData) => {
    if (this.destroyed) {
      audioData.close();
      return;
    }
    if (!this.context) {
      this.context = new AudioContext();
    }
    const now = this.context.currentTime;
    let startAt = this.nextTime;
    if (startAt < now - RESET_BEHIND_SECONDS || startAt < now) {
      // 落后于播放时钟：从当前时间重新对齐
      startAt = now + TARGET_AHEAD_SECONDS;
    } else if (startAt > now + MAX_AHEAD_SECONDS) {
      // 积压过多：丢弃该帧追赶实时
      this.nextTime = Math.max(this.nextTime - audioData.duration, now + TARGET_AHEAD_SECONDS);
      audioData.close();
      return;
    }
    this.nextTime = startAt + audioData.duration;

    const buffer = this.context.createBuffer(audioData.numberOfChannels, audioData.numberOfFrames, audioData.sampleRate);
    for (let plane = 0; plane < audioData.numberOfChannels; plane += 1) {
      const channel = new Float32Array(audioData.numberOfFrames);
      audioData.copyTo(channel, { planeIndex: plane, format: 'f32-planar' });
      buffer.copyToChannel(channel, plane);
    }
    audioData.close();

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    source.onended = () => source.disconnect();
    source.start(startAt);
  };

  /** 恢复被自动播放策略挂起的 AudioContext（需在用户手势内调用） */
  resume = () => {
    if (this.context && this.context.state === 'suspended') {
      this.context.resume().catch(() => {});
    }
  };

  destroy() {
    this.destroyed = true;
    try {
      this.decoder?.close();
    } catch {
      // 解码器可能已关闭
    }
    this.decoder = null;
    this.context?.close().catch(() => {});
    this.context = null;
  }
}
