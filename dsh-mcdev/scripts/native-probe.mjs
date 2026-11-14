#!/usr/bin/env node
// native provider 真机探针（可重复运行）。
//
// 流程：读取工程配置 -> 发现游戏 exe -> 确保开发世界 -> 写 dev_config.cppconfig ->
//       装 dsh_bridge 行为包 + 更新世界清单 -> spawn 游戏 -> 等 bridge hello + 进入存档 ->
//       exec(client/server) -> 官方日志检查 -> 截图 -> （可选）reload -> stop。
//
// 用法：
//   node scripts/native-probe.mjs                 # 完整验证（结束后停止游戏）
//   node scripts/native-probe.mjs --keep          # 保留游戏运行（写 state.json，用 --stop 结束）
//   node scripts/native-probe.mjs --stop          # 结束 --keep 留下的游戏进程
//   node scripts/native-probe.mjs --timeout 240000 --project <dir> [--reset]
//
// 退出码：0=全部关键检查通过；1=有失败；2=启动/就绪失败。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createNativeProvider } from '../lib/native/index.js';
import { isProcessAlive, killProcessTree, listGamePids } from '../lib/native/util.js';
import { bridgePackDir, officialLogsDir } from '../lib/native/bridgePack.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(scriptDir, '..');
const workspaceDir = path.resolve(pluginDir, '..', '..');

function parseArgs(argv) {
  const args = {
    project: workspaceDir,
    keep: false,
    stop: false,
    reset: false,
    timeout: 240000,
    stateFile: path.join(workspaceDir, '.dsh-tmp', 'native-probe-state.json'),
  };
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    const next = () => argv[++i];
    switch (item) {
      case '--project':
        args.project = path.resolve(next());
        break;
      case '--keep':
        args.keep = true;
        break;
      case '--stop':
        args.stop = true;
        break;
      case '--reset':
        args.reset = true;
        break;
      case '--timeout':
        args.timeout = Number(next()) || args.timeout;
        break;
      case '--state':
        args.stateFile = path.resolve(next());
        break;
      case '--help':
      case '-h':
        console.log(
          [
            '用法: node scripts/native-probe.mjs [选项]',
            '  --project <dir>   工程目录（含 .mcdev.json，默认工作区根）',
            '  --keep            成功后保留游戏运行（写 state.json，可 --stop 结束）',
            '  --stop            结束 --keep 留下的进程',
            '  --reset           启动前尝试重建开发世界（无模板时保留原世界）',
            '  --timeout <ms>    等待进入存档超时（默认 240000）',
          ].join('\n'),
        );
        process.exit(0);
        break;
      default:
        if (item.startsWith('-')) {
          console.error(`未知参数：${item}（--help 查看用法）`);
          process.exit(2);
        }
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const log = (message) => process.stdout.write(`${message}\n`);
const fail = (message) => process.stderr.write(`${message}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readState() {
  try {
    if (!fs.existsSync(args.stateFile)) return null;
    return JSON.parse(fs.readFileSync(args.stateFile, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(args.stateFile), { recursive: true });
  fs.writeFileSync(args.stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function removeState() {
  try {
    if (fs.existsSync(args.stateFile)) fs.unlinkSync(args.stateFile);
  } catch {
    /* ignore */
  }
}

/** --stop：结束 state.json 记录的游戏进程。 */
async function stopFromState() {
  const state = readState();
  const result = { ok: true, action: 'stop', removed: [], remaining: [] };
  if (!state || !state.gamePid) {
    result.ok = true;
    result.reason = '没有 state.json（可能未用 --keep 启动过）';
    log(JSON.stringify(result, null, 2));
    return 0;
  }
  const pid = Number(state.gamePid);
  if (isProcessAlive(pid)) {
    log(`[stop] 结束游戏进程树 pid=${pid}`);
    await killProcessTree(pid);
    for (let i = 0; i < 25 && isProcessAlive(pid); i++) await sleep(200);
  }
  if (isProcessAlive(pid)) result.remaining.push(pid);
  else result.removed.push(pid);
  result.ok = result.remaining.length === 0;
  if (result.ok) removeState();
  log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 1;
}

function summarizeLogs(lines) {
  return lines.map((line) => line.text);
}

async function main() {
  if (args.stop) return stopFromState();

  const beforeGamePids = await listGamePids();
  const report = {
    ok: false,
    provider: 'native',
    startedAt: new Date().toISOString(),
    projectDir: args.project,
    pluginDir,
    bridgePackDir: bridgePackDir(),
    logsDir: officialLogsDir(),
    userGamePidsBefore: beforeGamePids,
  };

  // 有旧 state 先清理，避免多实例争用
  const staleState = readState();
  if (staleState && staleState.gamePid && isProcessAlive(Number(staleState.gamePid))) {
    log(`[probe] 清理上一轮 --keep 进程 pid=${staleState.gamePid}`);
    await killProcessTree(Number(staleState.gamePid));
    for (let i = 0; i < 25 && isProcessAlive(Number(staleState.gamePid)); i++) await sleep(200);
    removeState();
  }

  const provider = createNativeProvider({
    projectDir: args.project,
    pluginDir,
    startTimeoutMs: args.timeout,
    detachedGames: args.keep,
  });

  let exitCode = 2;
  try {
    const discovered = provider.discover();
    report.discover = discovered;
    log(`[probe] 游戏：${discovered.gameExe || '<未找到>'}（${discovered.gameVersion || '?'}）`);
    log(`[probe] 世界：${discovered.world && discovered.world.dir}（exists=${discovered.world && discovered.world.exists}）`);
    log(`[probe] 日志目录：${discovered.logsDir}`);
    if (!discovered.gameExe) throw new Error('未找到 Minecraft.Windows.exe（检查 .mcdev.json 的 game_executable_path）');

    // 启动（waitMs=0 立即返回 launching）
    const spawnAt = Date.now();
    const launchStatus = await provider.start({ waitMs: 0, reset: args.reset });
    report.spawnMs = Date.now() - spawnAt;
    report.launchStatus = launchStatus;
    log(`[probe] 已启动：phase=${launchStatus.phase} gamePid=${launchStatus.gamePid} bridge.port=${launchStatus.bridge && launchStatus.bridge.port}`);
    if (args.keep && launchStatus.gamePid) {
      writeState({
        gamePid: launchStatus.gamePid,
        projectDir: args.project,
        bridgePort: launchStatus.bridge && launchStatus.bridge.port,
        startedAt: new Date().toISOString(),
        ready: false,
      });
    }

    const readyAt = Date.now();
    const readyStatus = await provider.waitReady(args.timeout);
    report.readyMs = Date.now() - readyAt;
    report.readyStatus = readyStatus;
    log(`[probe] 就绪：phase=${readyStatus.phase} ready=${readyStatus.ready} 耗时=${report.readyMs}ms`);
    if (readyStatus.phase !== 'ready') {
      report.error = readyStatus.lastError || `未进入存档（phase=${readyStatus.phase}）`;
      report.bridgeClients = readyStatus.bridge && readyStatus.bridge.clients;
      fail(`[probe] ${report.error}`);
      // 打印最后 40 行日志帮助排查
      report.traceLogSample = summarizeLogs(provider.logs({ limit: 40 }).lines);
      throw new Error(report.error);
    }
    if (args.keep) {
      writeState({
        gamePid: readyStatus.gamePid,
        projectDir: args.project,
        bridgePort: readyStatus.bridge && readyStatus.bridge.port,
        startedAt: new Date().toISOString(),
        ready: true,
      });
    }

    // exec client
    const clientCode =
      '_result = {"side": "client", "tag": "[NATIVE_TEST] client", "answer": 42, "pid": __import__("os").getpid()}\nprint("[NATIVE_TEST] client print")';
    const clientExec = await provider.exec(clientCode, 'client', { timeoutMs: 60000 });
    report.execClient = clientExec;
    // 立即查一次日志，确认 client print 已经过 tee 回传（官方日志量大，晚查会被环形缓冲挤掉）
    const logsAfterClient = provider.logs({ limit: 2000 }).lines;
    report.clientPrintInLogs = logsAfterClient.some((line) => line.text.includes('[NATIVE_TEST] client print'));
    log(`[probe] exec(client) ok=${clientExec.ok} returnValue=${JSON.stringify(clientExec.returnValue || clientExec.error)} clientPrintInLogs=${report.clientPrintInLogs}`);

    // exec server
    const serverCode =
      '_result = {"side": "server", "tag": "[NATIVE_TEST] server", "answer": 7}\nprint("[NATIVE_TEST] server print")';
    const serverExec = await provider.exec(serverCode, 'server', { timeoutMs: 60000 });
    report.execServer = serverExec;
    log(`[probe] exec(server) ok=${serverExec.ok} returnValue=${JSON.stringify(serverExec.returnValue || serverExec.error)}`);

    // 表达式/异常/持久变量三种形态
    const expression = await provider.exec('1 + 2', 'client', { timeoutMs: 30000 });
    report.execExpression = expression;
    const failure = await provider.exec('raise ValueError("NATIVE_TEST boom")', 'client', { timeoutMs: 30000 });
    report.execFailure = failure;
    log(`[probe] exec(expression) ok=${expression.ok} value=${JSON.stringify(expression.returnValue)}；exec(失败用例) ok=${failure.ok}`);

    // 桥接自检：tee（stdout 捕获）状态 + 立即检查 print 是否经 socket 上报
    const selfCheckCode = [
      'import sys',
      'try:',
      '    import dsh_bridge.modMain as _m',
      '    _result = {"ok": True, "tee": bool(_m._LOG_TEE_INSTALLED.get("done")), "stdout": repr(sys.stdout)[:200], "states": sorted(list(_m._STATES.keys()))}',
      'except Exception:',
      '    import traceback',
      '    _result = {"ok": False, "error": traceback.format_exc()}',
      'print("[NATIVE_TEST] selfcheck print")',
    ].join('\n');
    const selfCheck = await provider.exec(selfCheckCode, 'client', { timeoutMs: 30000 });
    report.selfCheck = selfCheck;
    await sleep(400);
    const earlyLogs = provider.logs({ limit: 2000 }).lines;
    report.earlyLogHasPrint = earlyLogs.some((line) => line.text.includes('[NATIVE_TEST] selfcheck print'));
    log(`[probe] 自检：tee 状态=${JSON.stringify(selfCheck.returnValue && selfCheck.returnValue.tee)}；print 回传=${report.earlyLogHasPrint}`);

    // 日志：等一会让官方日志落盘，再检查 print 是否出现在日志里
    await sleep(800);
    const logLines = provider.logs({ limit: 2000 }).lines;
    report.logs = {
      buffered: logLines.length,
      next: provider.logs({ limit: 1 }).next,
      hasNativeTest: logLines.some((line) => line.text.includes('[NATIVE_TEST]')),
      nativeTestLines: logLines.filter((line) => line.text.includes('[NATIVE_TEST]')).map((line) => line.text).slice(-10),
      hasTraceback: logLines.some((line) => line.text.includes('Traceback') || line.text.includes('NATIVE_TEST boom')),
      errorLines: logLines.filter((line) => /\[(ERROR|WARN|FATAL)\]|Traceback/.test(line.text)).length,
      sample: logLines.slice(-12).map((line) => line.text),
    };
    log(`[probe] 日志：缓冲 ${report.logs.buffered} 行，含 NATIVE_TEST=${report.logs.hasNativeTest}，含 traceback=${report.logs.hasTraceback}`);

    // 截图
    const shot = await provider.screenshot({ timeoutMs: 25000 });
    report.screenshot = shot;
    log(`[probe] 截图：ok=${shot.ok} ${shot.ok ? `${shot.file} ${shot.width}x${shot.height} ${shot.bytes}B (${shot.method})` : shot.error}`);

    // reload：scripts 预期 unsupported；addons 尝试 refresh_addons
    const reloadScripts = await provider.reload('scripts');
    report.reloadScripts = reloadScripts;
    const reloadAddons = await provider.reload('addons');
    report.reloadAddons = reloadAddons;
    log(`[probe] reload(scripts) ok=${reloadScripts.ok}（预期 false/unsupported）；reload(addons) ok=${reloadAddons.ok}`);
    if (reloadAddons.ok) await sleep(1000);

    // jsonui /screens、input 兼容接口
    try {
      report.jsonuiScreens = await provider.jsonui('/screens');
    } catch (error) {
      report.jsonuiScreens = { ok: false, error: error.message };
    }
    log(`[probe] jsonui(/screens) ok=${report.jsonuiScreens && report.jsonuiScreens.ok}`);

    report.ok = Boolean(
      report.earlyLogHasPrint &&
        report.execClient &&
        report.execClient.ok &&
        report.execServer &&
        report.execServer.ok &&
        report.execExpression &&
        report.execExpression.ok &&
        report.execFailure &&
        report.execFailure.ok === false &&
        report.screenshot &&
        report.screenshot.ok &&
        report.jsonuiScreens &&
        report.jsonuiScreens.ok &&
        report.logs &&
        report.logs.buffered > 0,
    );
    exitCode = report.ok ? 0 : 1;
  } catch (error) {
    report.error = error.message;
    fail(`[probe] 失败：${error.message}`);
    try {
      report.traceLogSample = summarizeLogs(provider.logs({ limit: 60 }).lines);
    } catch {
      /* ignore */
    }
  } finally {
    if (!args.keep) {
      try {
        const stopped = await provider.stop();
        report.stoppedStatus = stopped;
        log(`[probe] 已停止：phase=${stopped.phase}`);
      } catch (error) {
        fail(`[probe] 停止失败：${error.message}`);
      }
      try {
        await provider.dispose();
      } catch {
        /* ignore */
      }
      await sleep(1000);
      const afterGamePids = await listGamePids();
      const leftovers = afterGamePids.filter((pid) => !beforeGamePids.includes(pid));
      report.leftoverGamePids = leftovers;
      if (leftovers.length) fail(`[probe] 警告：仍有本次启动的 Minecraft.Windows 进程未退出：${leftovers.join(', ')}`);
      else log('[probe] 已确认没有本次启动的 Minecraft.Windows 残留进程');
    } else {
      report.kept = true;
      log(`[probe] --keep：已保留游戏运行（state=${args.stateFile}）。结束请执行：node scripts/native-probe.mjs --stop`);
    }
  }

  report.finishedAt = new Date().toISOString();
  log('\n===== native 探针报告 =====');
  log(JSON.stringify(report, null, 2));
  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    fail(`[probe] 未捕获异常：${error && error.stack ? error.stack : error}`);
    process.exit(2);
  });
