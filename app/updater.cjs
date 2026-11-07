/**
 * updater.cjs — 检查更新 / 自动更新
 *
 * 为什么自己写而不是用 electron-updater：桌宠是**两种装机方式**混着用的，
 * 而它们「怎么更新」是两回事，得分别认：
 *
 *   ① git 装机（pi 扩展装法、`git clone` 后自己跑）：包根就是 git 工作区。
 *      查 = `git fetch` + 比 HEAD 和远端；更 = `git pull --ff-only`。
 *      这是**唯一能全自动**的一档，也是最常见的一档（pi 装的就是这个）。
 *   ② npm 装机（`npm i -g pi-dsh-pet`）：没有 .git，只能问 npm registry 有没有新版。
 *      全局装的话自动 `npm i -g <包名>@latest`；不是全局装（本地 npx / 自己 clone 完
 *      link 进来的）就**只报告、不代劳** —— 替别人跑 npm install 说不定改的是别处的依赖。
 *   ③ portable 单文件 exe：问 GitHub Releases 的 latest tag 比版本号，有新版就把
 *      新的 exe 下到同一个目录，**等本进程退出后**再覆盖上去（正在跑的 exe 是锁着的，
 *      覆盖不了）。顺手用 env 认：electron-builder 的 portable 启动器会给子进程塞
 *      `PORTABLE_EXECUTABLE_FILE`（原始 exe 的真实路径，不在临时解压目录里）。
 *   ④ 其它（解压即用的 zip / asar 打包版）：没有 .git 也没有 npm 装机信息，
 *      一律只报告当前版本 + 该去哪儿手动更。
 *
 * 两条硬规矩：
 *   - **不碰脏工作区**：`git status --porcelain` 非空就拒绝自动更。用户本地改了
 *     pi/assets/pet.js 还没提交时，pull 过去会让人丢改动（那比没更新糟糕得多）。
 *   - **只用 --ff-only**：宁可报「有更新但拉不下来（本地有分叉）」也不要自动 merge，
 *     merge 冲突留在一堆 webm/代码里是最难收拾的一种烂摊子。
 *
 * 更新完**宿主进程自己不会换代码**（它是 detached 的，没人负责再拉起它），
 * 所以调用方要自己换一扇窗：渲染层（pet.js / pet.css）立刻就是新的，
 * 宿主层（app/*）要等下次 `pi-pet restart`。
 *
 * 国内加速：GitHub 直连在国内常年几十 KB/s，三档全部走镜像 ——
 *   git fetch / GitHub API / exe 下载给 URL 加代理前缀（ghfast.top、gh-proxy.com，
 *   挂了自动退下一个，最后一个永远是直连）；npm 加 `--registry=npmmirror`，
 *   镜像上没有（新发布还没同步）再回官方 registry。
 *   开关：`PI_PET_GH_PROXY=https://xx,https://yy` / `=off` 只用直连；
 *        `PI_PET_NPM_REGISTRY=…` / `=""` 只用官方。
 */

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const https = require("node:https");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PKG_ROOT = path.resolve(__dirname, "..");
/** portable 那一档问的仓库（跟 package.json 的 repository 同一家，不另配） */
const REPO = "BeYourDreams/pi-dsh-pet";

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

/** 国内镜像前缀（顺序即尝试顺序）。`PI_PET_GH_PROXY=off` 关掉。 */
const GH_PROXIES = (process.env.PI_PET_GH_PROXY ?? "https://ghfast.top,https://gh-proxy.com")
	.split(",")
	.map((s) => s.trim().replace(/\/+$/, ""))
	.filter((s) => s && s !== "off");
/** npm 镜像。`PI_PET_NPM_REGISTRY=""` 只用官方 registry。 */
const NPM_REGISTRY = process.env.PI_PET_NPM_REGISTRY ?? "https://registry.npmmirror.com";

/** GitHub URL → 依次尝试的 URL（镜像在前、直连兜底）。非 GitHub 的原样一条。 */
function mirrorUrls(url) {
	const u = String(url || "");
	if (!/github(usercontent)?\.com/i.test(u)) return [u];
	return [...GH_PROXIES.map((p) => `${p}/${u}`), u];
}

/** 跑一条命令。**永不抛**：找不到 git / 超时 / 非零退出都变成返回值，
 *  更新失败只是「没更成」，绝不能把宿主带崩（它是那个 HTTP 服务）。 */
function run(cmd, args, { cwd = PKG_ROOT, timeoutMs = 15000 } = {}) {
	return new Promise((resolve) => {
		let child;
		try {
			child = spawn(cmd, args, { cwd, timeout: timeoutMs, windowsHide: true, shell: false });
		} catch {
			resolve(null);
			return;
		}
		let out = "";
		let errOut = "";
		let done = false;
		const finish = (code) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			resolve({ code, stdout: out.trim(), stderr: errOut.trim() });
		};
		// spawn 的 timeout 只发信号不一定收尸，自己再兜一层
		const timer = setTimeout(() => {
			try {
				child.kill();
			} catch {
				/* 已经退了 */
			}
			finish(-2);
		}, timeoutMs + 3000);
		timer.unref?.();
		if (child.stdout) child.stdout.on("data", (d) => { if (out.length < 1 << 20) out += d; });
		if (child.stderr) child.stderr.on("data", (d) => { if (errOut.length < 1 << 20) errOut += d; });
		child.on("error", () => finish(-1));
		child.on("close", (code) => finish(typeof code === "number" ? code : -1));
	});
}

/** git 在不在。不在的话 git 装机那套一律走不了（报告「没装 git」而不是干等超时）。 */
let gitChecked = null;
async function gitUsable() {
	if (gitChecked === null) {
		const r = await run("git", ["--version"], { timeoutMs: 8000 });
		gitChecked = !!(r && r.code === 0);
	}
	return gitChecked;
}

function readPkg() {
	try {
		const j = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf8"));
		return { name: String(j.name || "pi-dsh-pet"), version: String(j.version || "?") };
	} catch {
		return { name: "pi-dsh-pet", version: "?" };
	}
}

let npmRoot = null;
/** npm 的全局 node_modules 路径（拿不到就 null = 不敢替用户跑 npm i -g）。 */
async function globalNodeModules() {
	if (npmRoot !== null) return npmRoot;
	const r = await npmRun(["root", "-g"], 20000);
	npmRoot = r && r.code === 0 && r.stdout ? path.resolve(r.stdout) : "";
	return npmRoot;
}

/** npm 先走国内 registry，镜像答不上（新发布还没同步 / 镜像挂了）再回官方。 */
async function npmRun(args, timeoutMs) {
	if (NPM_REGISTRY) {
		const m = await run(NPM, [...args, `--registry=${NPM_REGISTRY}`], { timeoutMs });
		if (m && m.code === 0) return m;
	}
	return await run(NPM, args, { timeoutMs });
}

/**
 * 版本号比大小。**不能直接拿字符串比**：`2026.9.3` 会小于 `2026.09.30`，
 * 这种「假有更新」最气人（用户被反复骗着下同一个版本）。逐段按数字比，
 * 段数不够的当 0；非数字段（比如 pre-release 尾巴）退回字符串比。
 */
function cmpVersion(a, b) {
	const pa = String(a || "").replace(/^v/i, "").split(/[.\-+]/);
	const pb = String(b || "").replace(/^v/i, "").split(/[.\-+]/);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const sa = pa[i] || "0";
		const sb = pb[i] || "0";
		const na = Number(sa);
		const nb = Number(sb);
		if (Number.isFinite(na) && Number.isFinite(nb)) {
			if (na !== nb) return na < nb ? -1 : 1;
		} else if (sa !== sb) {
			return sa < sb ? -1 : 1;
		}
	}
	return 0;
}

/** GET 一个 URL，撞镜像：按 mirrorUrls 顺序试，第一个 200 的赢；全挂了返回最后一次结果。永不抛。 */
async function get(url, opts = {}) {
	let last = null;
	for (const u of mirrorUrls(url)) {
		last = await getOnce(u, opts);
		if (last && last.status === 200) return last;
	}
	return last;
}

/** GET 一个 URL（跟进重定向）。**永不抛**：更新查不到只是「没查到」。 */
function getOnce(url, { timeoutMs = 20000, redirects = 0 } = {}) {
	return new Promise((resolve) => {
		let settled = false;
		const done = (v) => { if (!settled) { settled = true; resolve(v); } };
		const req = https.get(url, { headers: { "user-agent": "pi-dsh-pet" } }, (res) => {
			const loc = res.headers.location;
			if ([301, 302, 303, 307, 308].includes(res.statusCode) && loc && redirects < 5) {
				res.resume();
				resolve(get(new URL(loc, url).href, { timeoutMs, redirects: redirects + 1 }));
				return;
			}
			const chunks = [];
			let n = 0;
			res.on("data", (d) => { if (n < 4 << 20) { chunks.push(d); n += d.length; } });
			res.on("end", () => done({ status: res.statusCode, body: Buffer.concat(chunks) }));
			res.on("error", () => done(null));
		});
		req.setTimeout(timeoutMs, () => { req.destroy(); done(null); });
		req.on("error", () => done(null));
	});
}

/** 下载到文件，撞镜像（同 get）。永不抛。 */
async function download(url, dest, opts = {}) {
	let last = null;
	for (const u of mirrorUrls(url)) {
		last = await downloadOnce(u, dest, opts);
		if (last.ok) return last;
	}
	return last;
}

/** 下载到文件（先写 .part 再改名，避免中途断网留下半个 exe 当新版）。永不抛。 */
function downloadOnce(url, dest, { timeoutMs = 20 * 60 * 1000, redirects = 0, onProgress } = {}) {
	return new Promise((resolve) => {
		let settled = false;
		const done = (v) => { if (!settled) { settled = true; resolve(v); } };
		const req = https.get(url, { headers: { "user-agent": "pi-dsh-pet" } }, (res) => {
			const loc = res.headers.location;
			if ([301, 302, 303, 307, 308].includes(res.statusCode) && loc && redirects < 5) {
				res.resume();
				resolve(downloadOnce(new URL(loc, url).href, dest, { timeoutMs, redirects: redirects + 1, onProgress }));
				return;
			}
			if (res.statusCode !== 200) {
				res.resume();
				done({ ok: false, note: `下载失败：HTTP ${res.statusCode}` });
				return;
			}
			const tmp = `${dest}.part`;
			const out = fs.createWriteStream(tmp);
			// 进度：0.1% 或 500ms 才报一次（每个 chunk 都报 = 一秒几十帧气泡，白烧 UI）
			const total = Number(res.headers["content-length"]) || 0;
			let loaded = 0;
			let lastStep = -1;
			let lastAt = 0;
			res.on("data", (d) => {
				loaded += d.length;
				const step = total ? Math.floor((loaded / total) * 1000) : 0;
				if (typeof onProgress !== "function" || (step === lastStep && Date.now() - lastAt < 500)) return;
				lastStep = step;
				lastAt = Date.now();
				try { onProgress({ loaded, total }); } catch { /* 上报进度炸了不该毁掉下载 */ }
			});
			res.on("error", () => done({ ok: false, note: "下载中断了（多半是网断），没动原来的 exe" }));
			out.on("error", (err) => done({ ok: false, note: `写不进 ${path.dirname(dest)}：${err.message}` }));
			out.on("finish", () => {
				try {
					fs.renameSync(tmp, dest);
					done({ ok: true, mb: Math.round(Number(res.headers["content-length"] || 0) / 1048576) });
				} catch (err) {
					done({ ok: false, note: `下完了但存不进 ${path.dirname(dest)}：${err.message}` });
				}
			});
			res.pipe(out);
		});
		req.setTimeout(timeoutMs, () => { req.destroy(); done({ ok: false, note: "下载超时（网太慢？）" }); });
		req.on("error", (err) => done({ ok: false, note: `下载失败：${err.message}` }));
	});
}

/**
 * 等本进程（+ portable 启动器）退出后把新 exe 覆盖上去。
 * 写一个 .cmd 文件再跑，而不是拼命令行字符串：路径里有空格 / & / % 时字符串拼法太脆。
 * 覆盖失败不声张（弹窗早关了），只留文件在原地，用户自己挪也行。
 */
function swapAfterExit(src, dest, pids) {
	const script = [
		"@echo off",
		":wait",
		...pids.filter(Boolean).map((pid) => `tasklist /fi "PID eq ${pid}" | find "${pid}" >nul`),
		...pids.filter(Boolean).map(() => "if not errorlevel 1 goto wait"),
		"ping -n 2 127.0.0.1 >nul",
		`move /y "${src}" "${dest}" >nul`,
		'del "%~f0"',
		"",
	].join("\r\n");
	try {
		const f = path.join(os.tmpdir(), `pi-pet-swap-${process.pid}.cmd`);
		fs.writeFileSync(f, script, "utf8");
		const child = spawn("cmd.exe", ["/c", f], { detached: true, stdio: "ignore", windowsHide: true });
		child.unref();
	} catch {
		/* 起不来拉倒：.new.exe 还在目录里，用户自己改名覆盖 */
	}
}

/** 这是什么装机？给菜单和 dialog 看的「当前版本」也从这儿出。 */
async function detect() {
	const pkg = readPkg();
	const base = { name: pkg.name, version: pkg.version, dir: PKG_ROOT };
	if (fs.existsSync(path.join(PKG_ROOT, ".git"))) {
		if (!(await gitUsable())) return { ...base, mode: "unknown", reason: "这是个 git 检出，但系统里没有 git 命令" };
		return { ...base, mode: "git" };
	}
	// portable 单文件：electron-builder 的启动器会把这个 env 传下来，指向磁盘上那个 exe。
	// ⚠️ 必须排在 node_modules 之前：asar 里也可能有依赖目录，靠前才不会认错。
	const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
	if (portableExe && fs.existsSync(portableExe)) {
		return { ...base, mode: "portable", exe: portableExe, exeDir: path.dirname(path.resolve(portableExe)) };
	}
	if (PKG_ROOT.includes(`${path.sep}node_modules${path.sep}`)) {
		const g = await globalNodeModules();
		const global = !!g && path.resolve(PKG_ROOT).startsWith(g + path.sep);
		return { ...base, mode: "npm", global };
	}
	return { ...base, mode: "unknown" };
}

/** 远端跟踪分支：HEAD 跟着谁走就查谁。别写死 origin/main（有人用 master/别的远端名）。 */
async function remoteRef(dir) {
	for (const args of [
		["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
		["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
	]) {
		const r = await run("git", args, { cwd: dir, timeoutMs: 8000 });
		if (r && r.code === 0 && r.stdout) {
			// @{u} 给 origin/main；origin/HEAD 给 origin/main → 都要 refs/remotes/ 前缀才是真 ref
			const name = r.stdout.trim().replace(/^refs\/remotes\//, "");
			if (name && !name.includes("@{")) return `refs/remotes/${name}`;
		}
	}
	for (const cand of ["refs/remotes/origin/main", "refs/remotes/origin/master"]) {
		const r = await run("git", ["show-ref", "--verify", "--quiet", cand], { cwd: dir, timeoutMs: 8000 });
		if (r && r.code === 0) return cand;
	}
	return "";
}

async function shortSha(dir, ref) {
	const r = await run("git", ["rev-parse", "--short", ref], { cwd: dir, timeoutMs: 8000 });
	return r && r.code === 0 ? r.stdout : "";
}

/** 工作区脏不脏（有本地改动 / 未跟踪文件）。脏了不许自动更。 */
async function dirty(dir) {
	const r = await run("git", ["status", "--porcelain"], { cwd: dir, timeoutMs: 15000 });
	if (!r) return false; // 拿不到状态就别拦（真拦错了更烦人）
	return r.stdout.length > 0;
}

/** 这个检出跟谁走：{remote, branch, url}。拿不到就 null（自己 clone 的 / detached HEAD）。 */
async function upstream(dir) {
	const r = await run("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd: dir, timeoutMs: 8000 });
	const name = r && r.code === 0 ? r.stdout.trim() : "";
	if (!name || name.includes("@{") || name.endsWith("/")) return null;
	const i = name.indexOf("/");
	const remote = i > 0 ? name.slice(0, i) : "origin";
	const branch = i > 0 ? name.slice(i + 1) : name;
	const u = await run("git", ["remote", "get-url", remote], { cwd: dir, timeoutMs: 8000 });
	return { remote, branch, url: u && u.code === 0 ? u.stdout.trim() : "" };
}

/**
 * fetch，走镜像。代理只是给 URL 加前缀，所以 ref 得显式写：
 * `git fetch <url> +refs/heads/X:refs/remotes/<remote>/X` —— 写回原来的 remote ref，
 * 后面 `@{u}` / `git pull` 照旧认 origin/main，用户不用改任何 git 配置。
 */
async function gitFetch(dir, { timeoutMs = 45000 } = {}) {
	const up = await upstream(dir);
	if (!up || !up.url) return await run("git", ["fetch", "--quiet", "--prune"], { cwd: dir, timeoutMs });
	let last = null;
	for (const url of mirrorUrls(up.url)) {
		const refspec = `+refs/heads/${up.branch}:refs/remotes/${up.remote}/${up.branch}`;
		const r = await run("git", ["fetch", "--quiet", "--prune", url, refspec], { cwd: dir, timeoutMs });
		if (r && r.code === 0) return r;
		last = { code: -1, stdout: "", stderr: (r && (r.stderr || r.stdout)) || "git 没跑起来" };
	}
	return last;
}

/**
 * 查有没有新版。**只读**（git 只 fetch，不动工作区），所以可以随时调。
 * 返回 {ok, hasUpdate, mode, version, current, latest, behind, note}
 */
/**
 * 离线查（PI_PET_UPDATE_NO_FETCH=1）：只比本地已经 fetch 过的 ref，不碰网络。
 * 专给测试用（也适合没网时看一眼「我落后几个提交」）。
 * 自动检查（autoUpdate）不认这个开关 —— 用户要的是「启动就自动更到最新」。
 */
async function check({ fetch = process.env.PI_PET_UPDATE_NO_FETCH !== "1" } = {}) {
	const info = await detect();
	if (info.mode === "git") {
		if (fetch) {
			const f = await gitFetch(info.dir);
			if (!f || f.code !== 0) {
				return { ...info, ok: false, hasUpdate: false, note: "git fetch 失败（镜像和直连都没通，多半是没网），先按当前版本继续跑" };
			}
		}
		const ref = await remoteRef(info.dir);
		if (!ref) return { ...info, ok: false, hasUpdate: false, note: "这个检出没有可跟随的远端分支（自己 clone 的？）" };
		const current = await shortSha(info.dir, "HEAD");
		const latest = await shortSha(info.dir, ref);
		const cnt = await run("git", ["rev-list", "--count", `HEAD..${ref}`], { cwd: info.dir, timeoutMs: 10000 });
		const behind = cnt && cnt.code === 0 ? Number(cnt.stdout) || 0 : 0;
		const subj = await run("git", ["log", "-1", "--format=%s", ref], { cwd: info.dir, timeoutMs: 10000 });
		return {
			...info,
			ok: true,
			hasUpdate: behind > 0,
			behind,
			current,
			latest,
			note: behind > 0 && subj && subj.stdout ? `最新一条：${subj.stdout}` : "",
		};
	}
	if (info.mode === "npm") {
		const r = await npmRun(["view", info.name, "version"], 30000);
		if (!r || r.code !== 0 || !r.stdout) {
			return { ...info, ok: false, hasUpdate: false, note: "问不到 npm registry（没网/没 npm），先按当前版本继续跑" };
		}
		const latest = r.stdout.trim();
		return {
			...info,
			ok: true,
			hasUpdate: latest !== info.version,
			latest,
			note: info.global ? "" : "这个包不是全局装的，只报告不代劳（你自己在哪儿装的就在哪儿 npm i）",
		};
	}
	if (info.mode === "portable") {
		const r = await get(`https://api.github.com/repos/${REPO}/releases/latest`);
		if (!r || r.status !== 200) {
			return { ...info, ok: false, hasUpdate: false, note: "问不到 GitHub Releases（没网，或匿名 API 被限流了），先按当前版本继续跑" };
		}
		let j;
		try {
			j = JSON.parse(r.body.toString("utf8"));
		} catch {
			return { ...info, ok: false, hasUpdate: false, note: "GitHub 回的不是 JSON（多半是被限流了），先按当前版本继续跑" };
		}
		const latest = String(j.tag_name || "").replace(/^v/i, "");
		const asset = (Array.isArray(j.assets) ? j.assets : []).find((a) => /\.exe$/i.test(String(a.name || "")));
		return {
			...info,
			ok: true,
			// current 用版本号（不是提交号）：portable 只有一个 exe，没有 git 历史可言
			current: info.version,
			latest,
			hasUpdate: !!latest && cmpVersion(latest, info.version) > 0,
			url: asset ? String(asset.browser_download_url || "") : "",
			note: asset ? "" : "这个 release 里没有 exe 附件，去 GitHub 手动下",
		};
	}
	return { ...info, ok: false, hasUpdate: false, note: info.reason || "这种装法没法自动更新（打包版 / 解压即用）" };
}

/**
 * 真的去更。返回 {ok, mode, note, restarted?} —— 调用方拿到 ok 之后
 * 自己决定要不要换一扇窗（宿主那边换窗 = 渲染层立刻用上新代码）。
 */
async function apply({ onProgress } = {}) {
	const info = await detect();
	if (info.mode === "git") {
		if (await dirty(info.dir)) {
			// ⚠️ 脏工作区绝大多数不是用户手改的，是 `npm run sync` 把开发那份推进来拓脏的
			//   （更新器故意不碰脏工作区，见文件头）。所以提示里得说清**怎么处理**：
			//   内容已经 push 过 ⇒ `git reset --hard <上游>` 就收干净（内容不会变）；
			//   还没 push ⇒ 先 push（sync-running.cjs 现在会自动收，前提是内容已在远端）。
			const up = await run("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd: info.dir, timeoutMs: 8000 });
			const ref = up && up.code === 0 ? up.stdout.trim() : "";
			const fix = ref
				? `多半是 npm run sync 推进去的：若这些内容已经 push 过，在那份检出里 git reset --hard ${ref} 收干净即可（内容不变）`
				: "多半是 npm run sync 推进去的：若这些内容已经 push 过，在那份检出里 git reset --hard 收干净即可（内容不变）";
			return {
				ok: false,
				mode: "git",
				note: `这个检出里有本地改动，先 commit 或 stash 了再更新（别让更新盖掉你的改动）。${fix}`,
			};
		}
		const before = await shortSha(info.dir, "HEAD");
		// 先镜像 fetch，再本地 --ff-only merge（不用 pull：pull 自己会去问 github 直连）
		const f = await gitFetch(info.dir, { timeoutMs: 120000 });
		const r = f && f.code === 0 ? await run("git", ["merge", "--ff-only", "--quiet", "@{u}"], { cwd: info.dir, timeoutMs: 60000 }) : f;
		if (!r || r.code !== 0) {
			const why = (r && (r.stderr || r.stdout)) || "git 没跑起来";
			return { ok: false, mode: "git", note: `拉不下来：${why.split("\n")[0]}` };
		}
		const after = await shortSha(info.dir, "HEAD");
		return {
			ok: true,
			mode: "git",
			note: after && before && after !== before ? `已更新：${before} → ${after}` : "已经是最新",
			changed: !!(after && before && after !== before),
		};
	}
	if (info.mode === "portable") {
		const chk = await check({ fetch: false });
		if (!chk.ok) return { ok: false, mode: "portable", note: chk.note };
		if (!chk.hasUpdate) return { ok: true, mode: "portable", note: "已经是最新", changed: false };
		if (!chk.url) return { ok: false, mode: "portable", note: "这个 release 里没有 exe 附件，去 GitHub 手动下" };
		// 下到 exe 旁边（同目录才有权限写）。原来那个正在跑、被锁着，只能等退出后再换。
		const dest = path.resolve(info.exe);
		const staged = `${dest}.new`;
		const d = await download(chk.url, staged, { onProgress });
		if (!d.ok) return { ok: false, mode: "portable", note: d.note };
		swapAfterExit(staged, dest, [process.pid, process.ppid]);
		return {
			ok: true,
			mode: "portable",
			changed: true,
			note:
				`新版本 ${chk.latest}${d.mb ? `（约 ${d.mb}MB）` : ""} 已下到 ${staged}\n` +
				"退出本程序后会自动覆盖原来的 exe，下次双击就是新版",
		};
	}
	if (info.mode === "npm" && info.global) {
		const r = await npmRun(["install", "-g", `${info.name}@latest`], 240000);
		if (!r || r.code !== 0) {
			const why = (r && (r.stderr || r.stdout)) || "npm 没跑起来";
			return { ok: false, mode: "npm", note: `npm 装失败：${why.split("\n").slice(-1)[0]}` };
		}
		const after = await check({ fetch: false });
		return { ok: true, mode: "npm", note: `已装上 ${info.name}@${after.version || "?"}（宿主自身要 pi-pet restart 才换新代码）` };
	}
	return { ok: false, mode: info.mode, note: info.note || info.reason || "这种装法没法自动更新，手动来" };
}

/* ============================== 启动时的自动检查 ============================== */

/** 6h 内不重复查：宿主是 keepAlive 长驻的，别的 tick 拉起来就会查一次。 */
const AUTO_GAP_MS = Number(process.env.PI_PET_UPDATE_GAP_MS || 6 * 3600 * 1000);
/** 启动后先等一会儿再查：别跟宿主起窗抢 IO。 */
const AUTO_DELAY_MS = Number(process.env.PI_PET_UPDATE_DELAY_MS || 12000);

function readStateFile(home, file) {
	try {
		return JSON.parse(fs.readFileSync(path.join(home, file), "utf8")) || {};
	} catch {
		return {};
	}
}

function writeStateFile(home, file, patch) {
	try {
		fs.mkdirSync(home, { recursive: true });
		fs.writeFileSync(path.join(home, file), `${JSON.stringify(patch, null, 2)}\n`, "utf8");
	} catch {
		/* 记不住就当没记（顶多多查一次） */
	}
}

/**
 * 启动后自动查一次、有新版就装上（用户要求「启动自动检查更新到最新版本」）。
 *
 * 开关：`PI_PET_NO_UPDATE=1` 全关；`PI_PET_UPDATE_GAP_MS` 调间隔；
 * `PI_PET_UPDATE=check` 只查不装。
 *
 * 返回一个 Promise 便于测试；宿主那边只是 `void` 掉它。所有失败都只走 onNote，
 * **不弹窗** —— 启动时弹窗打断用户，而且这类事天天发生。
 */
function autoUpdate(home, { log: logFn, onUpdated, onProgress, delayMs = AUTO_DELAY_MS, gapMs = AUTO_GAP_MS } = {}) {
	const note = (s) => {
		if (logFn) logFn(s);
	};
	if (process.env.PI_PET_NO_UPDATE === "1") {
		note("PI_PET_NO_UPDATE=1 → 不自动检查更新");
		return Promise.resolve({ skipped: "disabled" });
	}
	return new Promise((resolve) => {
		const timer = setTimeout(async () => {
			timer.unref?.();
			const st = readStateFile(home, "update.json");
			const last = Number(st.lastCheck) || 0;
			if (last && Date.now() - last < gapMs) {
				note(`上次检查才过去 ${Math.round((Date.now() - last) / 60000)} 分钟，跳过（要强制查走菜单「检查更新」）`);
				resolve({ skipped: "recent" });
				return;
			}
			let res;
			try {
				res = await check();
			} catch (err) {
				note(`自动检查更新炸了：${err && err.message}`);
				resolve({ ok: false });
				return;
			}
			writeStateFile(home, "update.json", {
				...st,
				lastCheck: Date.now(),
				lastMode: res.mode,
				lastCurrent: res.current || "",
				lastResult: res.note || (res.hasUpdate ? "有更新" : "已是最新"),
			});
			if (!res.ok) {
				note(`自动检查更新：${res.note || res.mode}`);
				resolve(res);
				return;
			}
if (!res.hasUpdate) {
				note(`自动检查更新：已是最新（${res.current || res.version}）`);
				resolve(res);
				return;
			}
			// portable：125MB 的 exe 没人想在开机 12s 后偷偷下。查、要，就走菜单。
			if (res.mode === "portable") {
				note(`自动检查更新：portable 单文件不自动下载，有新版（${res.latest}）请走菜单「检查更新…」`);
				resolve(res);
				return;
			}
			// 「只查不装」档：手动启动时想看「有没有新版」但别让它动工作区
			if (process.env.PI_PET_UPDATE === "check") {
				note(`PI_PET_UPDATE=check → 只查不装：${res.note || `有更新（落后 ${res.behind || 0} 个提交）`}`);
				resolve({ ...res, skipped: "check-only" });
				return;
			}
			note(`自动检查更新：有新版（${res.current || res.version} → ${res.latest || "?"}），正在更新…`);
			let ap;
			try {
				ap = await apply({ onProgress });
			} catch (err) {
				note(`自动更新炸了：${err && err.message}`);
				resolve({ ok: false });
				return;
			}
			writeStateFile(home, "update.json", { lastCheck: Date.now(), lastApplied: Date.now(), lastMode: ap.mode, lastResult: ap.note });
			note(`自动更新：${ap.note}`);
			// 只在真的动了代码才让调用方换窗（换窗 = 1.5s 后新代码接管渲染层）
			if (ap.ok && ap.changed !== false && onUpdated) {
				try {
					onUpdated(ap);
				} catch (err) {
					note(`更新完了但换窗失败：${err && err.message}`);
				}
			}
			resolve({ ...res, applied: ap });
		}, Math.max(0, delayMs));
		timer.unref?.();
	});
}

/** 读 home/update.json（上次查/更到哪儿了）：给「关于」框和 /state 用。 */
function readUpdateInfo(home) {
	const st = readStateFile(home, "update.json");
	return {
		lastCheck: Number(st.lastCheck) || 0,
		lastApplied: Number(st.lastApplied) || 0,
		lastResult: String(st.lastResult || ""),
		mode: String(st.lastMode || ""),
		current: String(st.lastCurrent || ""),
	};
}

module.exports = { detect, check, apply, autoUpdate, readUpdateInfo, cmpVersion, mirrorUrls, PKG_ROOT };
