import { spawn } from 'node:child_process';
import readline from 'node:readline';

/**
 * 全屏程序检测（仅 Windows）：
 * 常驻一个 PowerShell 子进程，内部按固定间隔用 Win32 API 检查前台窗口是否
 * 铺满所在显示器，每个采样输出一行 `1`/`0`；Node 侧要求连续多次采样一致才
 * 切换状态，避免 alt-tab 掠过全屏窗口时的抖动。
 *
 * 设计边界（检测不到就静默放弃，绝不影响存档监控本身）：
 * - 非 Windows 平台 start() 直接返回 false，功能不存在；
 * - PowerShell 缺失、启动失败或反复崩溃时停用并回调 onUnavailable 一次；
 * - 排除 translime 自身窗口与系统外壳（桌面/任务栏）；
 * - 独占全屏（D3D exclusive）识别覆盖不佳，无边框全屏窗口可稳定识别。
 */

const POLL_INTERVAL_MS = 1500;
const STABLE_READINGS = 2;
const MAX_RESTARTS = 3;
const RESTART_DELAY_MS = 5000;
const STABLE_UPTIME_MS = 60000;

/**
 * 采样状态机：连续 stableReadings 次采样与当前状态不同才触发 onChange。
 *
 * @param {{stableReadings?: number, onChange?: Function}} options
 * @returns {(sample: string|number|boolean) => boolean} 应用一次采样，返回当前状态
 */
export const createFullscreenStateResolver = ({
  stableReadings = STABLE_READINGS,
  onChange = () => {},
} = {}) => {
  let current = false;
  let candidate = null;
  let candidateCount = 0;
  return (sample) => {
    const value = sample === true || sample === 1 || sample === '1';
    if (value === current) {
      candidate = null;
      candidateCount = 0;
      return current;
    }
    if (candidate === value) {
      candidateCount += 1;
    } else {
      candidate = value;
      candidateCount = 1;
    }
    if (candidateCount >= stableReadings) {
      current = value;
      candidate = null;
      candidateCount = 0;
      onChange(current);
    }
    return current;
  };
};

/**
 * 生成 PowerShell 探测脚本：编译一次 Win32 P/Invoke 后常驻循环采样。
 * 排除宿主自身进程与桌面/任务栏外壳窗口，前台窗口矩形与所在显示器矩形
 * 完全一致时视为全屏。
 *
 * @param {{hostPid: number, intervalMs: number}} options
 * @returns {string}
 */
export const buildProbeScript = ({ hostPid, intervalMs }) => `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class FullscreenProbe {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder name, int maxCount);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO info);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
}
"@
$hostPid = ${hostPid}
$excludedClasses = @('Progman', 'WorkerW', 'Shell_TrayWnd')
while ($true) {
  $fullscreen = $false
  try {
    $window = [FullscreenProbe]::GetForegroundWindow()
    if ($window -ne [IntPtr]::Zero) {
      $ownerPid = [uint32]0
      [void][FullscreenProbe]::GetWindowThreadProcessId($window, [ref]$ownerPid)
      $className = New-Object System.Text.StringBuilder 256
      [void][FullscreenProbe]::GetClassName($window, $className, $className.Capacity)
      if ([int]$ownerPid -ne $hostPid -and -not $excludedClasses.Contains($className.ToString())) {
        $monitor = [FullscreenProbe]::MonitorFromWindow($window, 2)
        $info = New-Object FullscreenProbe+MONITORINFO
        $info.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($info)
        if ([FullscreenProbe]::GetMonitorInfo($monitor, [ref]$info)) {
          $rect = New-Object FullscreenProbe+RECT
          [void][FullscreenProbe]::GetWindowRect($window, [ref]$rect)
          $fullscreen = $rect.Left -eq $info.rcMonitor.Left -and $rect.Top -eq $info.rcMonitor.Top -and $rect.Right -eq $info.rcMonitor.Right -and $rect.Bottom -eq $info.rcMonitor.Bottom
        }
      }
    }
  } catch {
    $fullscreen = $false
  }
  Write-Output ($(if ($fullscreen) { '1' } else { '0' }))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds ${intervalMs}
}
`;

const createFullscreenWatcher = ({
  stableReadings = STABLE_READINGS,
  onFullscreenChange = () => {},
  onUnavailable = () => {},
} = {}) => {
  let child = null;
  let stopping = false;
  let restarts = 0;
  let startedAt = 0;
  let restartTimer = null;

  const clearRestartTimer = () => {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  };

  const startChild = () => {
    if (stopping) {
      return;
    }
    const script = buildProbeScript({ hostPid: process.pid, intervalMs: POLL_INTERVAL_MS });
    try {
      child = spawn(
        'powershell.exe',
        [
          '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
          '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64'),
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (e) {
      child = null;
      onUnavailable(e);
      return;
    }
    startedAt = Date.now();
    const applySample = createFullscreenStateResolver({
      stableReadings,
      onChange: onFullscreenChange,
    });
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      applySample(line.trim());
    });
    child.on('error', (e) => {
      // spawn 本身失败（如系统无 PowerShell）：不再重试
      child = null;
      stopping = true;
      onUnavailable(e);
    });
    child.on('exit', () => {
      child = null;
      if (stopping) {
        return;
      }
      if (Date.now() - startedAt > STABLE_UPTIME_MS) {
        restarts = 0;
      }
      restarts += 1;
      if (restarts > MAX_RESTARTS) {
        stopping = true;
        onUnavailable(new Error(`全屏检测进程反复退出（已重试 ${MAX_RESTARTS} 次）`));
        return;
      }
      restartTimer = setTimeout(startChild, RESTART_DELAY_MS);
    });
  };

  return {
    /** 非 Windows 平台返回 false 表示功能不可用 */
    start() {
      if (process.platform !== 'win32') {
        return false;
      }
      stopping = false;
      startChild();
      return true;
    },
    stop() {
      stopping = true;
      clearRestartTimer();
      if (child) {
        child.removeAllListeners();
        child.kill();
        child = null;
      }
    },
  };
};

export default createFullscreenWatcher;
