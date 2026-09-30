#!/usr/bin/env node
/**
 * 并行监听插件主进程与 UI 两套 Vite 构建。
 *
 * 主进程与 UI 构建使用 `--mode watch` 启动，
 * 该模式下主进程构建不清空 dist，避免两套 watch 互相删除产物。
 */
import { spawn } from 'node:child_process';

const TASKS = [
  { name: '[main]', args: ['build', '--watch', '--mode', 'watch'] },
  { name: '[ui]', args: ['build', '-c', 'ui.vite.config.mjs', '--watch', '--mode', 'watch'] },
];

let exiting = false;

const stopOthers = (current) => {
  TASKS.forEach((task) => {
    if (task.child && task.child !== current && task.child.exitCode === null) {
      task.child.kill();
    }
  });
};

const forwardOutput = (name, stream) => {
  stream.setEncoding('utf8');
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    lines.forEach((line) => process.stdout.write(`${name} ${line}\n`));
  });
  stream.on('end', () => {
    if (buffer) {
      process.stdout.write(`${name} ${buffer}\n`);
    }
  });
};

const startTask = (task) => {
  // Windows 下 vite 是 .cmd 脚本，需要经过 shell 启动；
  // 命令与参数拼成单个字符串，避免 shell + args 数组的弃用告警
  task.child = spawn(`vite ${task.args.join(' ')}`, {
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  forwardOutput(task.name, task.child.stdout);
  forwardOutput(task.name, task.child.stderr);
  task.child.on('exit', (code) => {
    if (exiting) {
      return;
    }
    // 任一构建进程退出即整体退出，避免只剩一半 watch
    exiting = true;
    stopOthers(task.child);
    process.exit(code === 0 ? 0 : 1);
  });
  task.child.on('error', (err) => {
    process.stderr.write(`${task.name} 构建进程启动失败: ${err.message}\n`);
  });
};

TASKS.forEach(startTask);

process.on('SIGINT', () => {
  exiting = true;
  TASKS.forEach((task) => {
    if (task.child && task.child.exitCode === null) {
      task.child.kill();
    }
  });
  process.exit(0);
});
