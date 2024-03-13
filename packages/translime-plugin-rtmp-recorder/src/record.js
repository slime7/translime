import EventEmitter from 'events';
import { resolve } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import pkg from '../package.json';

class Record extends EventEmitter {
  constructor() {
    super();
    this.id = pkg.name;
    this.tasks = {}; // 任务列表
    this.recordList = []; // 录制列表
  }

  addTask(sendToClient, {
    taskId,
    url,
    saveDir,
    options = {},
  }) {
    this.tasks[taskId] = {
      recordInfo: {
        url,
        saveDir,
        options: {
          ...{
            splitTimeout: 60,
            saveFilenameTemplate: 'record',
            saveFormat: 'mp4',
            audioCodec: 'copy',
            videoCodec: 'copy',
          },
          ...options,
        },
      },
      error: '',
    };
  }

  start(sendToClient, {
    taskId,
    url,
    saveDir,
    options = {},
  }) {
    const finalOptions = {
      ...{
        splitTimeout: 60,
        saveFilenameTemplate: 'record',
        saveFormat: 'mp4',
        audioCodec: 'copy',
        videoCodec: 'copy',
      },
      ...options,
    };

    const autoSplit = typeof finalOptions.splitTimeout === 'number' && finalOptions.splitTimeout > 0;
    const getOutputFilePath = () => resolve(saveDir, `${finalOptions.saveFilenameTemplate}${autoSplit ? '_%03d' : ''}.${finalOptions.saveFormat}`);
    const startRecord = () => {
      this.tasks[taskId] = {
        command: null,
        progress: {},
      };
      this.tasks[taskId].command = ffmpeg(url)
        .output(getOutputFilePath())
        .audioCodec(finalOptions.audioCodec)
        .videoCodec(finalOptions.videoCodec);
      if (autoSplit) {
        this.tasks[taskId].command.outputOptions([
          '-f segment', // 分割输出为多个文件
          `-segment_time ${finalOptions.splitTimeout}`, // 分割时长
          '-reset_timestamps 1', // 重置分段文件的时间戳
        ]);
      }
      this.tasks[taskId].command.on('end', () => {
        sendToClient(`stop-reply@${this.id}`, { taskId }, this.getPluginWin());
      })
        .on('progress', (progress) => {
          if (!this.tasks[taskId]) {
            return;
          }
          this.tasks[taskId].progress = progress;
          sendToClient(`progress-reply@${this.id}`, { taskId, progress: this.tasks[taskId].progress }, this.getPluginWin());
        })
        .on('stderr', (stderrLine) => {
          sendToClient(`stderr-reply@${this.id}`, { taskId, stderrLine }, this.getPluginWin());
        })
        .on('error', (err) => {
          sendToClient(`error-reply@${this.id}`, { taskId, error: err.message }, this.getPluginWin());
        })
        .run();
    };

    startRecord();
  }

  stop(taskId, force = false) {
    // todo: 处理 ffprobe 进程残留
    if (this.tasks[taskId] && this.tasks[taskId].command) {
      this.tasks[taskId]?.command?.ffmpegProc?.stdin?.write('q');
      if (force) {
        this.tasks[taskId]?.command?.ffmpegProc?.stdin?.write('\x03');
      }
      const commandCopy = this.tasks[taskId]?.command;
      delete this.tasks[taskId];
      setTimeout(() => {
        commandCopy?.kill('SIGINT');
      }, 5000);
    }
  }

  stopAll() {
    const ids = Object.keys(this.tasks);
    if (!ids.length) {
      return;
    }
    ids.forEach((taskId) => {
      this.stop(taskId, true);
    });
  }

  getPluginWin() {
    return global?.childWins?.[`plugin-window-${this.id}`] || global.mainStore.getChildWin(`plugin-window-${this.id}`);
  }
}

const record = new Record();
export default record;
