import { execFile } from 'node:child_process';
import path from 'node:path';

// nbtstat 名称表行（与系统语言无关的解析方式）：取 `<00>` 注册名，跳过 WORKGROUP 组名。
// 中文系统输出「唯一」、英文系统输出「UNIQUE」，组标记为「组/GROUP」，均不参与匹配。
const NAME_LINE_PATTERN = /^(\S+)\s+<00>/;

/**
 * 从 nbtstat 输出解析远端 NetBIOS 机器名（第一个非 WORKGROUP 的 <00> 注册名）。
 */
export const parseNetbiosName = (stdout) => {
  const found = (stdout || '')
    .split(/\r?\n/)
    .map((line) => NAME_LINE_PATTERN.exec(line.trim()))
    .find((entry) => entry && entry[1].toUpperCase() !== 'WORKGROUP');
  return found ? found[1] : null;
};

/**
 * 通过 nbtstat 查询 SMB 主机的 NetBIOS 机器名（仅 Windows，查询失败返回 null）。
 * 用途：邮箱（UPN）形式用户名的 NTLM 认证需要显式域名，机器名是本地登录的可用值。
 */
export const discoverSmbHostName = async (host) => {
  if (process.platform !== 'win32' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return null;
  }
  // 绝对路径避免 PATH 差异；多网卡机器上 nbtstat 逐适配器查询可达十几秒，
  // 超时过短会让自动补域被静默跳过
  const nbtstat = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'nbtstat.exe');
  try {
    const stdout = await new Promise((resolve, reject) => {
      execFile(nbtstat, ['-A', host], {
        windowsHide: true,
        timeout: 30 * 1000,
        maxBuffer: 64 * 1024,
      }, (error, output) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(output);
      });
    });
    return parseNetbiosName(stdout);
  } catch {
    return null;
  }
};
