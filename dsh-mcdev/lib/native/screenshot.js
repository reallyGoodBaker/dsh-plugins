// 游戏窗口截图：PowerShell + Win32 PrintWindow（不抢前台），保存为 JPG。
//
// 为什么不用 MCP：native provider 没有 MCP Server；官方 ModSDK 也没有直接导出“截游戏窗口”的稳定 API，
// 所以用 Win32 窗口捕获：PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT=2)，失败再退回 BitBlt/屏幕拷贝。
//
// 只依赖 Node 内置模块 + 系统 PowerShell（Windows 自带）。

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { isProcessAlive } from './util.js';

/** 生成 PowerShell 截图脚本（PID/输出路径内联，脚本本身不用外部参数）。 */
function buildScript(pid, outFile) {
  const pidValue = Number(pid);
  const out = String(outFile).replace(/'/g, "''");
  return String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$pidValue = ${pidValue}
$outFile = '${out}'

Add-Type -AssemblyName System.Drawing
if (-not ('DshWin32' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class DshWin32 {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool altTab);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  private static IntPtr s_best = IntPtr.Zero;
  private static long s_bestArea = 0;
  private static bool EnumCallback(IntPtr hWnd, IntPtr lParam) {
    uint pid = 0;
    GetWindowThreadProcessId(hWnd, out pid);
    if (pid != (uint)lParam.ToInt64()) return true;
    if (!IsWindowVisible(hWnd)) return true;
    RECT rect;
    if (!GetWindowRect(hWnd, out rect)) return true;
    long area = (long)(rect.Right - rect.Left) * (long)(rect.Bottom - rect.Top);
    if (area > s_bestArea) { s_bestArea = area; s_best = hWnd; }
    return true;
  }
  public static IntPtr FindMainWindow(uint pid) {
    s_best = IntPtr.Zero;
    s_bestArea = 0;
    EnumWindows(EnumCallback, new IntPtr((long)pid));
    return s_best;
  }
  public static string TitleOf(IntPtr hWnd) {
    int len = GetWindowTextLength(hWnd);
    if (len <= 0) return "";
    StringBuilder sb = new StringBuilder(len + 2);
    GetWindowText(hWnd, sb, sb.Capacity);
    return sb.ToString();
  }
}
'@
}

function Write-Result($obj) {
  $json = $obj | ConvertTo-Json -Compress
  [Console]::Out.WriteLine($json)
}

try {
  $proc = Get-Process -Id $pidValue -ErrorAction Stop
  $proc.Refresh()
  # 先按 PID 枚举可见顶层窗口（MainWindowHandle 在部分进程/时机下为 0，不可靠）
  $hwnd = [DshWin32]::FindMainWindow([uint32]$pidValue)
  if (($hwnd -eq [IntPtr]::Zero) -or ($hwnd -eq 0)) {
    Start-Sleep -Milliseconds 600
    $hwnd = [DshWin32]::FindMainWindow([uint32]$pidValue)
  }
  if (($hwnd -eq [IntPtr]::Zero) -or ($hwnd -eq 0)) {
    $proc.Refresh()
    $hwnd = $proc.MainWindowHandle
  }
  if (($hwnd -eq [IntPtr]::Zero) -or ($hwnd -eq 0)) {
    Write-Result @{ ok = $false; error = '找不到游戏主窗口（EnumWindows/MainWindowHandle 均为 0；游戏可能尚未创建窗口或已退出）' }
    exit 1
  }
  $windowTitle = [DshWin32]::TitleOf($hwnd)
  if ([DshWin32]::IsIconic($hwnd)) {
    Write-Result @{ ok = $false; error = '游戏窗口处于最小化状态，无法截图（请恢复窗口后重试）' }
    exit 1
  }
  $rect = New-Object DshWin32+RECT
  [void][DshWin32]::GetWindowRect($hwnd, [ref]$rect)
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if (($width -lt 16) -or ($height -lt 16)) {
    Write-Result @{ ok = $false; error = ('游戏窗口尺寸异常: ' + $width + 'x' + $height) }
    exit 1
  }

  function New-Bitmap() {
    return New-Object System.Drawing.Bitmap($width, $height)
  }

  function Test-Black($bmp) {
    $total = 0
    $count = 0
    $stepX = [Math]::Max(1, [int]($width / 40))
    $stepY = [Math]::Max(1, [int]($height / 40))
    for ($x = 0; $x -lt $width; $x += $stepX) {
      for ($y = 0; $y -lt $height; $y += $stepY) {
        $c = $bmp.GetPixel($x, $y)
        $total += ($c.R + $c.G + $c.B)
        $count++
      }
    }
    if ($count -eq 0) { return $true }
    return (($total / $count) -lt 9)
  }

  # DirectX/RenderDragon 的画面不会被 PrintWindow 复制（结果是纯白/浅灰单色）。
  # 只看客户区（跳过标题栏与边框）统计"接近白"的比例与亮度方差：
  # 游戏真正渲染时方差很高；白屏/未渲染时方差极低。
  function Test-Blank($bmp) {
    $top = [Math]::Min(34, [Math]::Max(0, [int]($height / 8)))
    $left = 2
    $right = [Math]::Max($left + 1, $width - 2)
    $bottom = [Math]::Max($top + 1, $height - 2)
    $nearWhite = 0
    $count = 0
    $sum = 0.0
    $sumSq = 0.0
    $stepX = [Math]::Max(1, [int](($right - $left) / 60))
    $stepY = [Math]::Max(1, [int](($bottom - $top) / 60))
    for ($x = $left; $x -lt $right; $x += $stepX) {
      for ($y = $top; $y -lt $bottom; $y += $stepY) {
        $c = $bmp.GetPixel($x, $y)
        $count++
        $luma = 0.299 * $c.R + 0.587 * $c.G + 0.114 * $c.B
        $sum += $luma
        $sumSq += $luma * $luma
        if ($c.R -ge 232 -and $c.G -ge 232 -and $c.B -ge 232) { $nearWhite++ }
      }
    }
    if ($count -eq 0) { return $true }
    $whiteRatio = $nearWhite / $count
    $mean = $sum / $count
    $variance = [Math]::Max(0.0, ($sumSq / $count) - ($mean * $mean))
    $stdDev = [Math]::Sqrt($variance)
    return (($whiteRatio -gt 0.55) -or ($stdDev -lt 10.0))
  }

  $method = ''
  $bmp = $null
  $blankReason = ''
  foreach ($flag in @(2, 0)) {
    $candidate = New-Bitmap
    $g = [System.Drawing.Graphics]::FromImage($candidate)
    $hdc = $g.GetHdc()
    $ok = $false
    try { $ok = [DshWin32]::PrintWindow($hwnd, $hdc, [uint32]$flag) } finally { $g.ReleaseHdc($hdc); $g.Dispose() }
    if ($ok -and (-not (Test-Black $candidate)) -and (-not (Test-Blank $candidate))) {
      $bmp = $candidate
      $method = 'PrintWindow-' + $flag
      break
    }
    if ($ok) { $blankReason = 'PrintWindow 只返回空白/单色（DirectX 画面无法被窗口消息复制）' }
    $candidate.Dispose()
  }

  # 兜底一：仅当游戏窗口当前就在前台时才直接屏幕拷贝（否则会截到遮挡它的其它窗口）。
  if ($null -eq $bmp) {
    if ([DshWin32]::GetForegroundWindow() -eq $hwnd) {
      $candidate = New-Bitmap
      $g = [System.Drawing.Graphics]::FromImage($candidate)
      $g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($width, $height)))
      $g.Dispose()
      if (-not (Test-Black $candidate) -and -not (Test-Blank $candidate)) {
        $bmp = $candidate
        $method = 'CopyFromScreen-foreground-already'
      } else {
        $candidate.Dispose()
      }
    } else {
      $blankReason = '窗口不在前台（DirectX 画面无法用 PrintWindow 复制）'
    }
  }

  # 兜底二：把游戏窗口短暂切到前台再拷贝（DirectX 内容只能这样拿到），随后把前台还给原来的窗口。
  # 窗口刚激活时画面可能还没重绘，所以最多试 4 次，间隔 220ms。
  if ($null -eq $bmp) {
    $previous = [DshWin32]::GetForegroundWindow()
    [void][DshWin32]::ShowWindow($hwnd, 9)   # SW_RESTORE
    [void][DshWin32]::BringWindowToTop($hwnd)
    [void][DshWin32]::SetForegroundWindow($hwnd)
    if ([DshWin32]::GetForegroundWindow() -ne $hwnd) {
      # 前台锁定：把当前前台线程的输入队列临时挂到自己线程，再 SetForegroundWindow 就能生效。
      try {
        $foreground = [DshWin32]::GetForegroundWindow()
        $foregroundPid = [uint32]0
        $foregroundThread = [DshWin32]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid)
        $currentThread = [DshWin32]::GetCurrentThreadId()
        if ($foregroundThread -ne 0) {
          [void][DshWin32]::AttachThreadInput($currentThread, $foregroundThread, $true)
          [void][DshWin32]::SetForegroundWindow($hwnd)
          [void][DshWin32]::AttachThreadInput($currentThread, $foregroundThread, $false)
        }
      } catch {
        # 继续尝试其它方式
      }
    }
    if ([DshWin32]::GetForegroundWindow() -ne $hwnd) {
      try {
        [DshWin32]::SwitchToThisWindow($hwnd, $true)
      } catch {
        # 继续尝试其它方式
      }
    }
    if ([DshWin32]::GetForegroundWindow() -ne $hwnd) {
      # 后台进程直接 SetForegroundWindow 常被 Windows 拒绝，用 WScript.Shell.AppActivate 兜底。
      try {
        $shell = New-Object -ComObject WScript.Shell
        [void]$shell.AppActivate($pidValue)
      } catch {
        # AppActivate 不可用时保持原前台窗口
      }
    }
    for ($attempt = 0; $attempt -lt 6 -and $null -eq $bmp; $attempt++) {
      Start-Sleep -Milliseconds 220
      if ([DshWin32]::GetForegroundWindow() -ne $hwnd) { continue }
      $candidate = New-Bitmap
      $g = [System.Drawing.Graphics]::FromImage($candidate)
      $g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($width, $height)))
      $g.Dispose()
      if (-not (Test-Black $candidate) -and -not (Test-Blank $candidate)) {
        $bmp = $candidate
        $method = 'CopyFromScreen-foreground'
      } else {
        $candidate.Dispose()
        if ($blankReason -eq '') { $blankReason = '窗口被其它窗口遮挡或游戏尚未渲染出画面' }
      }
    }
    if ($previous -ne [IntPtr]::Zero -and $previous -ne $hwnd) {
      [void][DshWin32]::SetForegroundWindow($previous)
    }
  }

  if ($null -eq $bmp) {
    Write-Result @{ ok = $false; error = ('截图为空白（' + $blankReason + '；请确认游戏窗口可见、未最小化、未被完全遮挡）') }
    exit 1
  }

  $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
  $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]85)
  [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($outFile)) | Out-Null
  $bmp.Save($outFile, $jpegCodec, $encoderParams)
  $bmp.Dispose()
  $bytes = (Get-Item $outFile).Length
  Write-Result @{ ok = $true; file = $outFile; width = $width; height = $height; bytes = $bytes; method = $method; title = $windowTitle }
  exit 0
} catch {
  Write-Result @{ ok = $false; error = $_.Exception.Message }
  exit 1
}
`;
}

/**
 * 截取指定进程的游戏窗口。
 * @param {{gamePid:number, outFile:string, timeoutMs?:number}} options
 * @returns {Promise<{ok:boolean, file?:string, width?:number, height?:number, bytes?:number, method?:string, error?:string}>}
 */
export function captureGameWindow(options) {
  const gamePid = Number(options.gamePid);
  if (!Number.isInteger(gamePid) || gamePid <= 0) {
    return Promise.resolve({ ok: false, error: '缺少游戏 PID（native provider 尚未启动游戏？）' });
  }
  if (!isProcessAlive(gamePid)) {
    return Promise.resolve({ ok: false, error: `游戏进程不存在（pid=${gamePid}）` });
  }
  const outFile = path.resolve(options.outFile);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const script = buildScript(gamePid, outFile);
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const timeoutMs = Number(options.timeoutMs) || 20000;
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const text = String(stdout || '').trim();
        let parsed = null;
        if (text) {
          const lines = text.split(/\r?\n/).filter((line) => line.trim());
          for (let i = lines.length - 1; i >= 0; i--) {
            try {
              parsed = JSON.parse(lines[i].trim());
              break;
            } catch {
              /* 继续找 JSON 行 */
            }
          }
        }
        if (parsed && parsed.ok) {
          resolve({ ...parsed, file: outFile });
          return;
        }
        const fallbackError = parsed && parsed.error
          ? String(parsed.error)
          : error && error.killed
            ? `截图命令超时（${timeoutMs}ms）`
            : String(stderr || (error && error.message) || '截图失败（PowerShell 未返回结果）').slice(0, 800);
        resolve({ ok: false, error: fallbackError });
      },
    );
  });
}
