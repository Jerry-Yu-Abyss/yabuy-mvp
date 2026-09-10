#!/usr/bin/env node
/**
 * 帶 functions 的 emulator 啟動器。
 *
 * 為什麼不直接在 package.json 裡寫 `FUNCTIONS_DISCOVERY_TIMEOUT=120 firebase ...`：
 * npm scripts 在 Windows 走 cmd.exe，`VAR=value cmd` 那個語法會被當成指令名稱而失敗。
 * 這支包一層就能跨平台，也不必為了一個環境變數多裝 cross-env。
 *
 * 為什麼需要拉長這個逾時（2026-09-10 事故）：
 *   firebase 啟動 functions emulator 時，會先跑一次使用者程式碼問「你有哪些函式」。
 *   預設只等 10 秒，這台機器冷啟動時來不及，於是印出
 *     Failed to load function definition from source: Timeout after 10000
 *   然後**照常把 emulator 起起來**——auth / firestore / pubsub 全都正常，
 *   只有觸發器一支都沒註冊。
 *
 *   後果是 check:trade 的第 9 節（記次 Cloud Function）整節被記成「略過未驗」，
 *   總數從 127 掉到 112，而輸出仍然是綠色的「全數通過」。這種「看起來過了、
 *   其實沒跑」比明確的失敗危險得多，因為沒有人會去追一個全綠的結果。
 *
 * 要調整就設環境變數，例如 FUNCTIONS_DISCOVERY_TIMEOUT=300 npm run emu:fn
 */

import { spawn } from 'node:child_process';

const TIMEOUT = process.env.FUNCTIONS_DISCOVERY_TIMEOUT || '120';

const args = [
  'emulators:start',
  '--only', 'auth,firestore,functions,pubsub',
  '--project', 'yabuy-2026a',
];

console.log(
  `\x1b[2m[emu-fn] FUNCTIONS_DISCOVERY_TIMEOUT=${TIMEOUT}（預設 10 秒不夠，觸發器會靜默不註冊）\x1b[0m`
);

const child = spawn('firebase', args, {
  stdio: 'inherit',
  shell: true, // Windows 上 firebase 是 .cmd，沒有 shell 找不到
  env: { ...process.env, FUNCTIONS_DISCOVERY_TIMEOUT: TIMEOUT },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
