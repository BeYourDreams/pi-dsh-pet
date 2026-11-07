/**
 * opencode 侧适配的集成测试：用假 PluginContext 驱动 opencode/pi-pet.ts 的 **V2** 入口
 * （`{ id, setup }`），看状态有没有真的变成 思考中 / 执行中 / 空闲，以及 pet 工具的
 * say/status 走不走得通。顺带确认 V1 的 `server()` 出口还在。
 * 跑：npm run test:opencode
 */
console.log("pi-dsh-pet opencode 适配测试（V2 plugin API）\n");
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HOME = mkdtempSync(join(tmpdir(), "pi-pet-oc-"));
const PORT = 47901;
const host = spawn(process.execPath, [join(ROOT, "bin", "pi-pet.cjs"), "serve", "--port", String(PORT)], {
  env: { ...process.env, PI_PET_HOME: HOME, PI_PET_SKIP_FOREIGN: "1" },
  stdio: ["ignore", "ignore", "inherit"],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let token = "";
for (let i = 0; i < 40; i++) {
  try {
    const h = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();
    if (h.role) {
      token = readFileSync(join(HOME, "token"), "utf8").trim();
      break;
    }
  } catch {}
  await sleep(150);
}
// 插件自己只会读 PI_PET_HOME / %APPDATA%，测试就指到临时目录（和真实 dsh 测试同思路）
process.env.PI_PET_HOME = HOME;

// 假窗
const win = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
const frames = [];
win.addEventListener("message", (e) => frames.push(String(e.data)));
await new Promise((r) => win.addEventListener("open", r));

// ---- 假 V2 插件 context：事件流 + tool transform ----
const queue = [];
let waiter = null;
const push = (event) => {
  queue.push(event);
  if (waiter) {
    const wake = waiter;
    waiter = null;
    wake();
  }
};
async function* eventStream({ signal } = {}) {
  while (!signal?.aborted) {
    if (queue.length) {
      yield queue.shift();
      continue;
    }
    await new Promise((resolve) => {
      waiter = resolve;
      signal?.addEventListener("abort", resolve, { once: true });
    });
  }
}

let petTool = null;
const ctx = {
  location: { directory: ROOT, project: { id: "test", directory: ROOT, canonical: ROOT } },
  app: { version: "2.2.5" },
  options: {},
  event: { subscribe: (opts) => eventStream(opts) },
  tool: {
    transform: async (callback) => {
      const tools = new Map();
      callback({ add: (tool) => tools.set(tool.name, tool) });
      petTool = tools.get("pet");
      return { dispose: async () => {} };
    },
  },
};

const { default: plugin } = await import("../opencode/pi-pet.ts");
const cleanup = await plugin.setup(ctx);
await sleep(300);

const fire = (event) => push(event);
const SESSION = "ses_1";
const MESSAGE = "msg_1";

// V2 的事件是 { id, created, type, data }，data 才带业务字段
await fire({ type: "session.created", data: { sessionID: SESSION, title: "第一版", location: { directory: ROOT } } });
await fire({ type: "session.renamed", data: { sessionID: SESSION, title: "摸鱼工程" } });
await fire({ type: "session.execution.started", data: { sessionID: SESSION } });
await sleep(150);
// 工具名只在 input.started 里；called 只有参数
await fire({ type: "session.tool.input.started", data: { sessionID: SESSION, assistantMessageID: MESSAGE, id: "tool_1", name: "bash" } });
await fire({
  type: "session.tool.called",
  data: { sessionID: SESSION, assistantMessageID: MESSAGE, id: "tool_1", input: { command: "npm test" }, executed: true },
});
await sleep(200);
await fire({
  type: "session.tool.success",
  data: { sessionID: SESSION, assistantMessageID: MESSAGE, id: "tool_1", content: [{ type: "text", text: "ok" }], executed: true },
});
await fire({ type: "session.idle", data: { sessionID: SESSION } });
await sleep(200);

const tool = (command) => petTool.execute({ command });
const sayOut = await tool("say 你今天摸鱼了吗");
await sleep(200);
const statusOut = await tool("status");
const badOut = await tool("frobnicate");

// 宿主起来时会补发 power 帧（开机状态不是事件），断言位置前先滤掉；
// v1.4 的会话气泡帧（session）是另一条通道，也不进 anim。
const anim = frames.filter((f) => !f.startsWith('{"type":"bubble"') && !f.startsWith('{"type":"power"') && !f.startsWith('{"type":"session"'));
const bubbles = frames.filter((f) => f.startsWith('{"type":"bubble"')).map((f) => JSON.parse(f).text);
const sessions = frames.filter((f) => f.startsWith('{"type":"session"') && !f.includes('"remove"')).map((f) => JSON.parse(f));
const st = await (
  await fetch(`http://127.0.0.1:${PORT}/state`, { headers: { authorization: `Bearer ${token}` } })
).json();

let total = 0, failed = 0;
const ok = (name, cond, extra = "") => {
  total++;
  if (cond) console.log("  ✓ " + name);
  else { failed++; console.log("  ✗ " + name + (extra ? " — " + extra : "")); }
};

ok("V2 默认导出带 id / setup", plugin.id === "pi-dsh-pet" && typeof plugin.setup === "function", String(plugin.id));
ok("V1 兼容出口 server() 还在", typeof plugin.server === "function");
ok("session.execution.started → 思考中", anim[0] === "thinking", JSON.stringify(anim));
ok("tool called → 执行中 + 工具名 + detail", anim[1] === '{"type":"tool_call","tool":"bash"}' && bubbles.includes("执行中：npm test"), JSON.stringify(anim) + " " + JSON.stringify(bubbles));
ok("session.idle → 回空闲", anim[2] === "agent_idle", JSON.stringify(anim));
ok("session.renamed → 气泡标题跟着换", sessions.some((s) => s.title === "摸鱼工程"), JSON.stringify(sessions));
ok("pet 工具 say → 气泡", bubbles.includes("你今天摸鱼了吗") && String(sayOut.content).includes("已说话"), JSON.stringify(bubbles));
ok("pet 工具 status 报出端口", String(statusOut.content).includes(`:${PORT}`), String(statusOut.content));
ok("pet 工具认得非法命令", String(badOut.content).includes("用法"), String(badOut.content));
ok("会话名存在 /state 里", st.bus.feedsBySource["opencode"] === 1, JSON.stringify(st.bus));
// v1.4：这个会话自己一条气泡（执行中 → 已完成，sid 前后不变 = 原地换）
ok("每会话一条气泡（sid 不变，状态变）", sessions.length >= 2 && sessions.every((s) => s.sid === sessions[0].sid) && sessions[sessions.length - 1].status === "done", JSON.stringify(sessions));

cleanup?.();
await fetch(`http://127.0.0.1:${PORT}/control`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: '{"action":"shutdown"}',
});
await sleep(600);
console.log(failed === 0 ? `
opencode 适配测试通过：${total} 通过 / 0 失败` : `
有失败：${total - failed} 通过 / ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
