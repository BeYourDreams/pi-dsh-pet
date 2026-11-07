# pi-dsh-pet 🐾

<p align="center">
  <a href="https://www.npmjs.com/package/pi-dsh-pet"><img alt="npm version" src="https://img.shields.io/npm/v/pi-dsh-pet?label=npm&color=blue"></a>
  <a href="https://www.npmjs.com/package/pi-dsh-pet"><img alt="npm monthly downloads" src="https://img.shields.io/npm/dm/pi-dsh-pet?label=下载&color=brightgreen"></a>
  <a href="https://github.com/BeYourDreams/pi-dsh-pet"><img alt="stars" src="https://img.shields.io/github/stars/BeYourDreams/pi-dsh-pet?style=social"></a>
  <a href="https://github.com/BeYourDreams/pi-dsh-pet/blob/main/LICENSE"><img alt="license" src="https://img.shields.io/github/license/BeYourDreams/pi-dsh-pet?color=orange"></a>
  <img alt="platform" src="https://img.shields.io/badge/platform-pi%20coding%20agent-8A2BE2">
assets-91%20animations-ff69b4
</p>

一只住在 **pi 终端编程助手**里的大肥鱼：待机呼吸、随机动作（含打瞌睡）、偶尔转向、屏幕漫游、点击反应、可拖拽。

> 现在它是一个**独立应用**：自己带一个 127.0.0.1 的 HTTP/WS 端口，pi、dsh、opencode、curl 都能驱动同一只宠物。
> 下行协议完全没变，老版本窗照旧能跑。

> 💡 宠物头顶**每个会话一条气泡**：多开几个 pi 就多几格，各写各的标题与「执行中 / 已完成」；
> 会话退出自动收掉，已完成的那条点一下也能收。见 [会话气泡](#会话气泡多开会话时头顶一会话一格)。

> Fork 自 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（[npm](https://www.npmjs.com/package/dsh-pet)），本项目专为 pi 平台适配 —— 响应 pi agent 工作状态（思考/写代码/空闲），通过 Electron 透明置顶小浮窗渲染（原 dsh-pet 用户请使用 npm 原版）。

> 💡 浮窗**只包住宠物本身**，不是全屏：全屏透明置顶窗每产生一帧，DWM 都得把整块桌面重新合成一遍，别的程序的后台窗口就抢不到合成预算（「桌宠一开，浏览器就不刷新了」）。想把它放到别处就**拖它**（拖 = 搬整扇窗，见 [移动与位置记忆](#移动与位置记忆)）。

---

## 快速开始

```sh
npm install -g pi-dsh-pet
pi-pet start          # 起桌宠（自带服务 + 窗）
```

在 pi 中运行（扩展会**自动**把宿主拉起来，不用手动 start）：

```
/pet             →  显示桌宠（正常大小 400px）
/pet small       →  小号（380px）
/pet large       →  大号（540px）
/pet-stop        →  隐藏桌宠（服务留着，pi/dsh 还能用）
/pet-say 摸鱼中  →  让它说句话
/pet-status      →  宿主在哪、探活多少毫秒
```

在 opencode 中用（插件会**自动**把宿主拉起来）：

```sh
# 拷到全局插件目录（opencode 启动时自动加载），项目内用 .opencode/plugins/ 也行
node -e "require('fs').copyFileSync('node_modules/pi-dsh-pet/opencode/pi-pet.ts', require('os').homedir()+'/.config/opencode/plugins/pi-pet.ts')"
```

> 💡 opencode **2.x** 换了插件 API：V1 的 `export default async function` 在 V2 里根本不会加载
> （日志会写 `Plugin must export a default definition with an id and an effect or setup function`）。
> 本文件同时提供两个入口 —— V2 用 `{ id, setup }`（`ctx.tool.transform` + `ctx.event.subscribe`），
> V1（1.18.29+）走 `server()` —— 一份文件两代都能跑。装完用 `opencode plugin list`
> 确认 ID 是 `pi-dsh-pet` 而不是 `-`。

opencode 没有客户端 `/pet` 这类斜杠命令注册（命令是 markdown 模板，每按一次都烧一次模型调用），
所以控制面是一个 `pet` 工具，让 agent 自己调：让它 `show` / `show large` / `hide` /
`say 你今天摸鱼了吗` / `status`；直接跟它说「把桌宠藏起来」也行。

不想装 pi 扩展也行，纯当本地服务用：

```sh
pi-pet status                 # 端口 / token / 生产者一览
pi-pet say 起来干活了          # 手动冒个泡
curl -X POST 127.0.0.1:47653/event -H "authorization: Bearer $(pi-pet token)" \
     -H 'content-type: application/json' -d '{"type":"thinking","task":"写代码"}'
```

也提供免安装单文件 exe（release 里就叫 `pi-dsh-pet.exe`），双击即可，不用 Node；
只有 exe 也能接自己的程序：端口与 token 在 `%APPDATA%\pi-dsh-pet\port` 与
`%APPDATA%\pi-dsh-pet\token`（右键菜单里有「复制服务地址」「打开数据文件夹」）；
要完整的 `pi-pet status/feed/say` 命令行则用 `npm i -g pi-dsh-pet`。

> 💡 首次运行需下载 Electron ≈100MB，后续启动秒开。

#### 为什么 exe 还是这么大

| 块 | 大小 | 能动吗 |
| --- | --- | --- |
| Electron 运行时 | ≈85MB（压后） | 不能，去掉就不是 Electron 了 |
| 93 个 webm 素材 | 51MB | **不能动**：禁止重编码/降分辨率（见下面的规则） |
| locales 语言包 | ≈41MB → 2MB | 已砍：只留 `zh-CN` / `en-US` |
| `dxcompiler/dxil.dll` | 26MB → 0 | 已删：D3D12 后端用不上（`scripts/after-pack.cjs`） |

当前产物 **≈125MB**（portable 单文件）。地板是上面第一行的 Electron，再往下只能换壳子
（WebView2 / Tauri）。

### 🚫 硬规则：素材不许降画质

**`assets/thumb/*.webm` 一律按原分辨率（640×360）、原码率打包，任何打包/发布流程都不得
重编码、缩放、抽帧、改 CRF。**

理由（实测，非推测）：VP9 已经是熵编码，再用 7z/zip 压只掉 1~2%
（brotli-11 实测 98.2%），而 ffmpeg 一重编码就掉 20~70% —— 省下的体积全是画质。
所以「压素材」这条省钱路已被删除，不是默认关闭。

| 想改 exe 大小 | 允许？ |
| --- | --- |
| 砍 locales / 删用不到的 dll（`scripts/after-pack.cjs`） | ✅ 不碰像素 |
| 调 `compression: maximum`（7z -mx=9） | ✅ 不碰像素 |
| ffmpeg 重编码 webm / 降分辨率 / 提 CRF | ❌ **禁止** |

真要再小，只剩两条不损画质的路：① 素材挪出 exe 改成同目录旁挂文件（单 exe 变 exe+目录，
UX 变了）；② 换 WebView2 / Tauri 壳（工作量另一个量级）。两条都不做的话，
**exe ≈125MB 就是本项目的地板**。

规则不是嘴上说说：`assets/thumb.sha256` 是入库的 sha256 清单，`npm test` 第一步就是
`node scripts/check-assets.cjs` —— 任何一个 webm 被重编码/缩放/改 CRF（哪怕分辨率没变），
字节一变就红，CI 的 `npm test` 也就跟着红，打不出 exe。要换素材就明着来：
换完跑 `node scripts/check-assets.cjs --write`，把清单一起提交（review 时看得见）。

### 不想用 CI？本地打包

```sh
npm i --no-save electron@33 electron-builder@25   # 只在打包这一步装，运行时依旧零依赖
npm run build          # → dist/pi-dsh-pet.exe（只有这一个：免安装单文件）
npm run build:dir      # 只出免安装目录版 dist/win-unpacked/，跑得快，适合先验证
```

> 不再出安装包（NSIS setup）：一个项目两个 exe 时最容易踩的是「双击了没反应」——
> setup 双击先弹 UAC 和安装向导，用户以为程序挂了。免安装单文件双击即用。

本地打包必踩的坑（CI 不会遇到：workflow 已经把环境和镜像备好了）：

| 坑 | 症状 | 怎么办 |
|----|------|--------|
| 没设镜像 | `connect ETIMEDOUT 20.205.243.166:443`（GitHub 的 IP），而且**炸在打包中途**，看着像随机挂 | `npm run build` 走 `scripts/build.cjs`，它已经把 `ELECTRON_MIRROR`（electron 运行时 zip）与 `ELECTRON_BUILDER_BINARIES_MIRROR`（nsis / 7zip 等）指到 npmmirror。外层自己设过这两个变量就不动它（CI 有自己的代理） |
| `--no-save` 分两次装 | 第二次 `npm i` 装完，electron 没了 → `Cannot compute electron version from installed node modules` | `--no-save` 装的包不进 package.json，**后一次 install 会把前一次的 prune 掉**。要装的写进同一条命令 |
| 装了实时防护（腾讯电脑管家 / 360），而且**不装 electron 就打** | `Cannot compute electron version from installed node modules` | 宿主零依赖，但**打包要 electron 本身**（`node_modules/electron/package.json`）：`npm i --no-save electron@33 electron-builder@25`，和 electron-builder 一条命令一起装 |
| 实时防护扫刚写出来的那个 180MB exe | `Fatal error: Unable to commit changes`（rcedit），或 `UNKNOWN: unknown error, open '…\pi-dsh-pet.exe'`（写 asar integrity 资源），或下一轮 `remove '…': Access is denied` | 全是**瞬态**的：报错那一瞬间对同一个文件读/改名/追加写全都正常，几十毫秒后自己好了。`scripts/build.cjs` 已经做了三手准备：关掉 rcedit 改用 resedit 写版本信息（`win.signAndEditExecutable: false`）、`retry-write.cjs` 原地重试写文件、整包重来 4 次。**根治**是把仓库目录加进防护的白名单/信任区（腾讯电脑管家里的「信任区」），那是机器设置，代码管不了 —— 详见 [DESIGN.md §10](./DESIGN.md) |

打包前会自动写一份「包身份戳」`app/build.cjs`（git sha / dirty / 素材段数），
`GET /health` 与 `pi-pet doctor` 都会报它 —— **对着旧 exe 调试时，界面上完全看不出来**，
那两行是唯一能看出「我跑的到底是哪次提交」的地方。

CI（推 main / 手动触发 `release` workflow）走同一条链，只是多两件事：
先用 `win-unpacked/pi-dsh-pet.exe` 真跑一次冒烟（起服务、查 `/health`、确认 asar 里的
页面与 93 个素材读得出来）
产物名里**没有版本号**（版本号 `YYYY.MM.DD.NNNN` 不是合法 semver，electron-builder 会
把它规范化成 `2026.9.3-0.2` 这种鬼样子），版本认 tag / release 说明。
发布链的约束（token 权限、跨 job 依赖）见 [DESIGN.md §10](./DESIGN.md)。

改 `.github/workflows/release.yml` 前先知道这三件事（前两件报错都指不到病根，第三件**根本不报错）：

| 坑 | 症状 | 后果 |
|----|------|------|
| 事件键顶格：`workflow_dispatch:` 写在第 0 列 | 编辑器报 `Unexpected value 'workflow_dispatch'` | 它变成**根级**键，`on:` 里只剩 `push` —— **手动触发入口静默消失**，推 tag/main 才跑 |
| 半截 step：`- name: xxx` 后面既没 `run:` 也没 `uses:` | 编辑器报 `There's not enough info to determine what you meant. Add one of these properties: cancel, run, shell, uses…` | 那一步是空转（重排步骤时留下的残渣），不是「忘了写 run」 |
| `concurrency.group` 里写 `${{ github.ref }}` | **没有任何报错**，两个 run 都是绿的 | 本 workflow 自己会 push tag：tag 事件和 main 事件是两个不同的 ref → 两个组 → **一次发布并行跑两个 run**，同时打 exe、同时建同一个 tag 的 release，抢出 `422 already_exists` |

前两行都是**合法 YAML**，所以 `npm test` 一度是绿的；第三行连 YAML 都不是问题所在，
GitHub 一句提示都不会给。`npm run test:workflow`（已挂在 `npm test` 第一步）钉这三件事，
外加「每个 job 都要有 `runs-on`/`steps`」、「`on:` 里必须真的有 `workflow_dispatch`」，
以及「concurrency 必须是**全局一把锁**（group 是字面量 + `cancel-in-progress: true`）」；
零依赖、离线跑。

**所以发布期间的规矩：全局只会有一个发布在跑，新来的会取消还在跑的。**
想连着发两个版本，就等前一个跑完再推——推第二个会把第一个的 exe 构建中途掐掉
（GitHub 上点那个被取消的 run 能看到）。推 tag 触发的那个 run 会把发布做完（它认
tag 上的版本号，不重算、不重建 tag）。零依赖、离线跑。

宠物会出现在屏幕右下角，开始动画链。当你在 pi 里写代码或提问时，宠物会自动响应：

| pi agent 状态 | 宠物动画 | 气泡 |
|---------------|----------|------|
| 开始思考 | 深度思考碎碎念 | 「任务」思考中… |
| 调用工具（bash/edit/write） | 写代码 | 执行中：npm test |
| 完成 | 回到随机动画链 | 完成：xxx ✓ |
| 空闲 | 恢复随机动画链 | 待命中… |

> 💡 思考/写代码状态中点击宠物 → 播放「点击回应-傲娇生气」→ 完整播完后自动回到当前状态动画。
> 💡 **右键桌宠** = 原生菜单：当前状态、事件来源、暂停响应、说点什么、换一只、
> 添加一只、隐藏宠物、在浏览器打开、复制服务地址、打开数据文件夹、关于、退出。
> （换尺寸与省电模式都已从菜单拿掉：换尺寸走 `/control {action:"set-ctrl", size, restartNonce}`，
> 省电接口已屏蔽，见下面「省电 / 占用」）

---

## 目录结构

```
pi-dsh-pet/
├── app/                # 宿主：协议 / 状态机 / HTTP+WS 服务 / 窗看护 / 单例锁 / CLI
├── bin/pi-pet.cjs      # 命令行入口（pi-pet = dsh-pet）
├── pi/extensions/      # pi 侧薄客户端（自动起宿主、事件 → 状态帧）
├── dsh/pi-pet.mjs      # dsh 侧适配（cordis 风格）
├── opencode/pi-pet.ts  # opencode 1/2 插件（V2 setup() + V1 server()）
├── pi/assets/          # Electron 窗口 UI（pet.html + pet.js + pet.css + preload + 主进程）
assets/preview/     # 93 个预览 GIF
assets/thumb/       # 93 个透明 WebM 动画
├── assets/config.jsonc # 动画到事件/标签的映射
├── electron-builder.yml# 打单文件 exe 用（日常开发不需要）
├── package.json        # npm 包清单
├── DESIGN.md           # 架构、协议、状态机、互斥、已知坑
├── LICENSE             # MIT
└── README.md
```

## 这机器上有两份 checkout（改完记得同步）

pi 装的是 git clone（在 `~/.pi/agent/git/github.com/BeYourDreams/pi-dsh-pet`），
人改代码的是另一份（比如 `D:\AI\pi-dsh-pet`）。**宿主从它自己那份起、也从它那份发 pet.js** ——
改错份的症状就是「改了没反应」，连 `restart` 也没用（窗拿到的还是旧 JS）。

```bash
node bin/pi-pet.cjs status   # ⚠ 会直接告诉你宿主跑的是哪一份、你在哪一份
npm run sync                 # 把当前这份的 app/bin/pi/assets 推到宿主在用的那份
node bin/pi-pet.cjs restart  # 换一扇窗，pet.js 才重新加载
```

`npm run sync` 宿主没在跑、或两边本来就是同一份时，什么都不做（退出码 0）。

## 动画预览

全部 93 个动画（640×360 WebM）：

**待机 / 转向**

<p>
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/daiji-huxi-xiuxian.gif" width="160" alt="待机呼吸休闲">
<img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/dongzhangxiwang.gif" width="160" alt="东张西望">
</p>

**移动**

<p>
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/pangxie-zoulu.gif" width="160" alt="螃蟹走路">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/yuandi-piaofu-tabu.gif" width="160" alt="原地漂浮踏步">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/yuandi-zuozhuan-benpao.gif" width="160" alt="原地左转奔跑">
</p>

**小动作**

<p>
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/youxian-hengga.gif" width="160" alt="悠闲哼歌">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chaoda-shenlanyao.gif" width="160" alt="超大伸懒腰">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/yuandi-qiaoji-zhuomian-hudong.gif" width="160" alt="原地敲击桌面互动">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/yuandi-zhongli-xiadun-yasuo.gif" width="160" alt="原地重力下蹲压缩">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/haqian-liantian.gif" width="160" alt="哈欠连天">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/yuandi-xiaoqi-chenmian.gif" width="160" alt="原地小憩沉眠">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/nvpu-quxi-liyi.gif" width="160" alt="女仆屈膝礼仪">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/beixiayitiao-zhamao.gif" width="160" alt="被吓一跳">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/xiaofudu-yuandi-360du-xuanzhuan-zhanshi.gif" width="160" alt="小幅度原地360度旋转展示">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/touchi-lingshi-bei-zhuazhu.gif" width="160" alt="偷吃零食被抓住">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/yong-jingyu-weiba-paidadi.gif" width="160" alt="用鲸鱼尾巴拍打地面">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/da-keshui-bei-jingxing.gif" width="160" alt="打瞌睡被惊醒">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/zhao-jingzi.gif" width="160" alt="照镜子">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/zhengti-huanzhuang-shise.gif" width="160" alt="整体换装试色">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/qingkuai-jilu.gif" width="160" alt="轻快记录">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/xie-daima.gif" width="160" alt="写代码">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/yaoshan-naliang.gif" width="160" alt="摇扇纳凉">
assets/preview/chenjian-shuaya.gif" width="160" alt="晨间刷牙">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/ye-wan-tang-chuang-shang-shui-jiao.gif" width="160" alt="夜晚躺在床上睡觉">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/shui-chuang-zuo-meng.gif" width="160" alt="睡床做梦">
</p>

**玩耍**

<p>
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/yuandi-zhuanxin-wan-mofang.gif" width="160" alt="原地专心玩魔方">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/yuandi-dunxia-wan-wanju-qiche.gif" width="160" alt="原地蹲下玩玩具汽车">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/jingyu-tu-paopao-texiao.gif" width="160" alt="鲸鱼吐泡泡特效">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/yuandi-tiaoyue-zhuasui-touding-wupin.gif" width="160" alt="原地跳跃抓碎头顶物品">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/wan-youxi-qijibaituai.gif" width="160" alt="玩游戏气急败坏">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/wan-shuiqiang.gif" width="160" alt="玩水枪">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/xiaotiqin-yanzou.gif" width="160" alt="小提琴演奏">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/lanjing-xianshi.gif" width="160" alt="蓝鲸现世">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/youya-nvpuwu.gif" width="160" alt="优雅女仆舞">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/qingkuai-yaobaiwu.gif" width="160" alt="轻快摇摆舞">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/keai-zhaiwu.gif" width="160" alt="可爱宅舞">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chui-qiqiu.gif" width="160" alt="吹气球">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/dongwu-huanrao.gif" width="160" alt="动物环绕">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/fang-fengzheng.gif" width="160" alt="放风筝">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chai-liwu.gif" width="160" alt="拆礼物">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/bian-gezi.gif" width="160" alt="变鸽子">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/puke-moshu.gif" width="160" alt="扑克魔术">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chou-tuoluo.gif" width="160" alt="抽陀螺">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chui-dizi.gif" width="160" alt="吹笛子">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/hudie-mifeng-huanrao-touding-kaihua.gif" width="160" alt="蝴蝶蜜蜂环绕头顶开花">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/lu-mao.gif" width="160" alt="撸猫">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/pingkong-shenghua.gif" width="160" alt="凭空生花">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/qi-muma.gif" width="160" alt="骑木马">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/sanqiu-paojie.gif" width="160" alt="三球抛接">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/ti-jianzi.gif" width="160" alt="踢毽子">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/xiawuziqi.gif" width="160" alt="下五子棋">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/dangqiuqian.gif" width="160" alt="荡秋千">
</p>

**吃什么**

<p>
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chi-baifan.gif" width="160" alt="吃白饭">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/dakou-chi-lingshi.gif" width="160" alt="大口吃零食">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chi-token.gif" width="160" alt="吃Token">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chi-zaocan.gif" width="160" alt="吃早餐">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chi-wucan.gif" width="160" alt="吃午餐">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chi-wancan.gif" width="160" alt="吃晚餐">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chi-bingqilin-ronghua.gif" width="160" alt="吃冰淇淋融化">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chi-dazhaxie.gif" width="160" alt="吃大闸蟹">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chi-tanghulu.gif" width="160" alt="吃糖葫芦">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chi-changshoumian.gif" width="160" alt="吃长寿面">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chi-xigua.gif" width="160" alt="吃西瓜">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/shuan-huoguo.gif" width="160" alt="涮火锅">
</p>

**时节**

<p>
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/beiluoye-yanmo.gif" width="160" alt="被落叶淹没">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/zhongqiu-shangyue-chi-yuebing.gif" width="160" alt="中秋赏月吃月饼">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/duixueren.gif" width="160" alt="堆雪人">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/fang-yanhua.gif" width="160" alt="放烟花">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chi-zongzi.gif" width="160" alt="吃粽子">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chi-niangao.gif" width="160" alt="吃年糕">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chi-qingtuan.gif" width="160" alt="吃青团">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chi-labazhou.gif" width="160" alt="吃腊八粥">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chi-chongyanggao.gif" width="160" alt="吃重阳糕">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/shou-hongbao.gif" width="160" alt="收红包">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/xie-fuzi.gif" width="160" alt="写福字">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chuanzhenqiqiao.gif" width="160" alt="穿针乞巧">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/wu-shitou.gif" width="160" alt="舞狮头">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/taotang-nanguadeng.gif" width="160" alt="讨糖南瓜灯">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/cha-zhuyu-shangju.gif" width="160" alt="插茱萸赏菊">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/fanghedeng.gif" width="160" alt="放河灯">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/menghua-xiaoyouling.gif" width="160" alt="萌化小幽灵">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/zhuangdian-shengdanshu.gif" width="160" alt="装点圣诞树">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/fang-kongmingdeng.gif" width="160" alt="放孔明灯">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chitangyuan.gif" width="160" alt="吃汤圆">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/chijiaozi.gif" width="160" alt="吃饺子">
</p>

**文字**

<p>
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/shia-chishenme.gif" width="160" alt="是啊，吃什么">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/shendu-sikao-suisuinian.gif" width="160" alt="深度思考碎碎念">
</p>

**点击回应 / 拖拽**

<p>
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/dianji-huiying-kaixin-yuedong.gif" width="160" alt="点击回应-开心跃动">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/dianji-huiying-haixiu-jingya.gif" width="160" alt="点击回应-害羞惊讶">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/dianji-huiying-aojiao-shengqi-ceshen-zhanshi.gif" width="160" alt="点击回应-傲娇生气">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/dianji-huiying-naoyang-gegexiao.gif" width="160" alt="点击回应-挠痒咯咯笑">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/dianji-huiying-yuanqi-huishou.gif" width="160" alt="点击回应-元气挥手">
  <img src="https://raw.githubusercontent.com/BeYourDreams/pi-dsh-pet/main/assets/preview/beishubiao-tuozhuai-xuankong-fankui.gif" width="160" alt="被鼠标拖拽悬空反馈">
</p>

> 💡 **拖到哪儿就记住哪儿**：松手时把落点（比例坐标）报给宿主，落盘在数据目录的
> `positions.json`；下次启动（或右键「换一只」重启窗）还在同一个地方，不用每次重拖。
> 换分辨率/换显示器也跟着走 —— 存的是比例不是像素。
> 想清掉记忆：删掉 `positions.json`，或 `POST /control {action:"set-position"}` 手改。

---

## 生成动画（不想手绘素材的路线）

`scripts/gen-anim.cjs` 能**程序化画出**新动画：纯 Node 光栅化（只用 `node:zlib`）→
PNG 帧序列 → ffmpeg 编成 640×360 透明 WebM。**只依赖 ffmpeg 一个外部程序**，
不装任何 npm 包；素材从零到可播，就下面这一条命令。

> `PRESETS` 目前是空的 —— 先按下一节的形状加一条预设，才有东西可生成。

```sh
# 1) 准备 ffmpeg（本机没有就下 https://www.gyan.dev/ffmpeg/builds/ 那个 7z/zip）
#    Windows 也可以 npm i --no-save ffmpeg-static（走 GitHub 下载，可能被墙）
FFMPEG_PATH=/path/to/ffmpeg npm run gen:anim            # 生成全部预设
FFMPEG_PATH=/path/to/ffmpeg npm run gen:anim -- --gif   # 顺带出 README 用的预览 GIF
npm run gen:anim -- my-anim # 只生成某一个预设
```

产物落 `assets/thumb/<名字>.webm`（窗按名字取 URL）和 `assets/preview/<拼音>.gif`（图库用）。
在 README 图库补一行，否则 `npm test`
的图库断言会直接失败（它盯着 preview 目录 ↔ README 链接 ↔ 「全部 N 个动画」三处一致）。

### 加一段新动画

编辑 `scripts/gen-anim.cjs` 的 `PRESETS`，加一条就行 —— 素材生成这边没有别的注册步骤；
**但生成完必须在 `assets/config.jsonc` 里给它归一类**，否则它不会被播（见下面
「🚫 硬规则：加了动画必须分类」）：

```js
my-anim: {
  file: "原地漂浮摇尾巴",          // = assets/thumb/ 里的文件名（config.jsonc 也用这个名）
  slug: "yuandi-piaofu-yao-weiba", // = assets/preview/ 里的 GIF 名（仓库惯例用拼音）
  frames: 48,                      // 帧数（48 帧 @24fps = 2s 一个循环，必须首尾相接）
  pose: (t) => ({ ... })           // t ∈ [0,1)，返回这一帧的姿态
}
```

`pose` 能拧的旋钮（`drawWhale` 读它们）：

| 字段 | 管什么 |
|------|--------|
| `scale` | 整体大小。**角色实际宽度 ≈ stage × 0.375**，所以 `scale: 0.85` ≈ 画布宽的 32% |
| `x` / `y` | 平移；`y: -10*Math.sin(TAU*t)` 就是上浮下沉 |
| `spin` | 整体旋转（弧度），打滚 = `TAU * t` |
| `sx` / `sy` | 挤压拉伸；`1 ± 0.03*sin()` = 呼吸感 |
| `wag` / `fin` | 尾鳍 / 胸鳍摆动角度（弧度） |
| `blink` | 眼睛开合，0 = 闭；想眨眼就用 `t > 0.58 && t < 0.66 ? 0.12 : 1` |
| `mouth` | 嘴巴张开程度 0..1 |

⚠️ **循环**：所有量都必须是 `t` 的周期函数（`sin/cos(TAU*t)`），否则播到接缝会跳一下。
打滚这类表演就是 `spin: TAU * t` —— 转满 360° 正好接回起点。

### 输出规格

| 项 | 值 | 为什么 |
|----|----|--------|
| 与现有 93 个素材一致；窗按 16:9 舞台排版 |
| 编码 | **VP8 + `yuva420p`**（`-auto-alt-ref 0`） | 见下面的坑 |
| 抠像 | 纯 alpha，背景 0 | 浮窗透明，多余的黑框会直接露馅 |
| 自检 | 逐帧扫 alpha 外接框，贴边就报错 | 「切边」是静默故障：看着像角色被削平 |

### 踩过的坑（都已在脚本里注释）

- **别用 VP9**：ffmpeg 自带的 vp9 解码器**根本不读 alpha**（解出来全不透明，而 Chrome 读）——
  也就是说你**没法自检**产物对不对。VP8 + libvpx 解码器能验，所以选 VP8，Chrome/Electron 一样放。
- **alpha 必须关 altref**：`-auto-alt-ref 0`。开着直接报
  `Transparency encoding with auto_alt_ref does not work`，编码器拒绝干活。
- **量纲**：画布里 rgb 是 0..255、alpha 曾经是 0..1；写 PNG 时不统一，就会得到「整张全白」
  或「整张全透明」的产物 —— 这两种都**不会报错**，只会让你以为宠物不见了。
- 形状用 3×3 超采样求覆盖率做抗锯齿；描边是「沿质心放大 1.12 倍先画深色再画本色」的土办法，
  比真描边便宜，640×360 够用。

→ 跳过：骨骼绑定、Lottie/矢量插值、素材版本管理。要更像手绘质感就往 `drawWhale` 里加渐变、
高光、腮红抖动，或者直接往 `pose` 里加曲线 —— 不需要引任何依赖。

## 视频转素材（现成 mp4 → assets/thumb/*.webm）

已经有视频/动图的时候，别去手写骨架 —— `scripts/mp4-to-webm.cjs` 一条命令搬进桌宠：

```sh
node scripts/mp4-to-webm.cjs "D:\Users\yxh\Downloads\生成图片.mp4" 夜晚躺在床上睡觉
FFMPEG_PATH=/path/to/ffmpeg node scripts/mp4-to-webm.cjs …    # ffmpeg 不在 PATH 时
```

### 完整生成流程（源不是 16:9 也没关系，绝不拉伸）

```sh
# 1. 转码：等比缩放 + 四周补**透明**边（不抠底，深色部分保留）
node scripts/mp4-to-webm.cjs "D:\Users\yxh\Downloads\生成图片.mp4" 夜晚躺在床上睡觉
#    → assets/thumb/夜晚躺在床上睡觉.webm（640×360，等比居中，两侧透明）

# 2. **分类**：把名字挂进 assets/config.jsonc 的某一类（吃/玩/休息/工作/思考），
#    否则宠物不会播它 —— 见下面「🚫 硬规则：加了动画必须分类」

# 3. 更新校验清单（sha256）并全量自检（自检里就包含「每个素材都有归属」）
node scripts/check-assets.cjs --write && npm test

# 4. 图库预览图（320×180）跟着换，否则 README 里摆的还是变形那张
node_modules/ffmpeg-static/ffmpeg.exe -y -i assets/thumb/夜晚躺在床上睡觉.webm \
  -vf "fps=12,scale=320:180:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer" \
  -loop 0 assets/preview/ye-wan-tang-chuang-shang-shui-jiao.gif

# 5. 推给在跑的那份 + 换窗
npm run sync && node bin/pi-pet.cjs restart
```

**源是方形/竖形怎么办 —— 等比缩 + 补透明边，这是唯一正解。**
旧脚本默认 `scale=640:360`，对 720×720 的源（就是「夜晚躺在床上睡觉」那份）就是
**横向压到 56%**：容器仍报 640×360 / SAR 1:1，播放器量到的还是 16:9，查容器查不出毛病，
屏幕上只表现为「人物被拉宽、比例不协调」。脚本现在遇到非 16:9 源自动走
`scale=…:force_original_aspect_ratio=decrease,pad=…:color=black@0`（等比 + 补边）。
⚠️ 补边颜色必须写 `black@0`：pad 默认填**不透明**黑，补出来的就是两条黑边条。
跑不了 pad 的机器**直接报错停下** —— 宁可不出素材，也别默默交一个变形的。

⚠️ ffmpeg 用哪一份（实测，别再猜）：

| ffmpeg | 结论 |
|--------|------|
| `node_modules/ffmpeg-static`（gyan.dev essentials，devDependency） | ✔ pad/colorkey/blend/alpha 全有 |
| `@ffmpeg-installer` 2018 | 有滤镜，但 `yuva420p` 编/解都失效 |
| Steam CSNZ 自带（`--disable-everything`） | 有 pad，编不出 alpha ⇒ 产物全不透明，桌面上是方块 |
| QQBrowser 自带 n7.1.1 | 根本没编解码 VP8/VP9 |

脚本自动按上面顺序找（`FFMPEG_PATH` 可覆盖），并**真跑一帧**验 pad 能不能用。

⚠️ 自检的盲区（实测踩过）：这些 ffmpeg **解不出** webm 的 alpha —— 抽帧出来的 PNG 连 alpha
通道都没有，于是「数半透明像素」永远得到 0，会误报「编不出 alpha」。脚本现在只在 PNG 真带
alpha 通道时才下结论，否则明说「量不了」。**验收得用 Chromium**：把 webm 画到 canvas 上数
`alpha>24` 的像素 —— 抠过底的应该在 10%~40% 之间，且 ink box 落在画布中间（方形源的 ink 宽
= 360，左右各 ~140px 透明），**顶满 0..640 就是没抠干净 / 没补透明边**。

脚本替人做的四件事（手敲 ffmpeg 十有八九会漏）：

1. **等比缩放 + 补透明边** —— 非 16:9 的源（AI 出的视频多半是方的）绝不硬 `scale=640:360`（见上）。
2. **`setsar=1`** —— 不复位的话产物带 `SAR 9:16`，播放器按竖幅显示，人物被拉长。
3. **`-auto-alt-ref 0`** —— 带 alpha 时开着它，编码器直接拒绝干活。
4. **产物自检** —— 尺寸、空文件都是**静默**故障（窗里只表现为这段动画不播），所以编完
   抽一帧验 alpha、验尺寸，不合格当场报错。

| 选项 | 默认 | 说明 |
|------|------|------|
| `--fps` | 24 | 与其余 93 个素材一致 |
| `--size` | 640x360 | **必须** 640×360：窗的 ink box / 命中区拿 640×360 当基准 |
| `--key` | 无 | 抠掉这个纯色底，如 `0x001133`（mp4 本身没有 alpha，只能靠它） |
| `--loop` | 0 | >0 时剪成 N 秒首尾交叉淡化的无缝循环 |
| ~~`--keep-aspect`~~ | — | **已删**：保比例现在是默认且强制的，别让「要不要保比例」再变成一个能踩的坑 |

⚠️ 素材长度：普遍 2~4s 一段；超过 4s 桌宠循环播完会有明显接缝（加 `--loop 3` 做无缝）。

### 素材放进去了，怎么才会被播？

**光有文件不会被播。** 窗只按 `assets/config.jsonc` 里写到的名字去取
`assets/thumb/<名字>.webm`，没被引用的素材就是躺在仓库里的一张图：

| config 字段 | 什么时候播 |
|-------------|-----------|
| `animations.idle[]` | 待机呼吸（会一直循环） |
| `animations.turn[]` | 走到边缘掉头 |
| `animations.clicks[]` | 单击随机回一个（5 个一循环） |
| `animations.hover[]` | 鼠标悬停 |
| `animations.categories[].actions[]` | 按 `weight` 抽小动作，按 `kind` 分语义：`eat` 吃 / `play` 玩 / `rest` 休息 / `work` 工作 / `think` 思考 / `misc` 其它 |
| `animations.categories[].group` | 成组播放：抽中这一类就连着演 N 段（`[最少, 最多]`）。吃/玩默认 `[2,3]`/`[2,4]`，其余默认 1 |
| `animations.sleep[]` | 睡觉动作：原地循环 `timing.sleepMs`（默认 15s）再演下一段 |
| `animations.parked[]` | **当前不播**但已分类的素材（例：漫游关闭时那几段走路片）。想开就挪去 `moves.actions` |

所以加一段素材 = **三步**：`mp4-to-webm.cjs` 落文件 → 在 config 里把名字挂到上面某一栏 →
`npm test` 确认没红。

### 🚫 硬规则：加了动画**必须分类**

`assets/thumb/` 里每一个 `.webm` 都必须在 `assets/config.jsonc` 里有**且仅有一处**归属
（`idle` / `turn` / `drag` / `clicks` / `moves.actions` / 某个 `categories[].actions` /
`parked`；`hover` 与 `sleep` 是**复用**，不算第二次分类）。`npm test` 逐条盯：

- 「每个素材都有归属」—— 落了文件没进 config（宠物躺在仓库里当一张图）
- 「每个动作只归一处」—— 同一段挂了两个分类（抽签逻辑说不清它演到哪算完）
- 「每个动作名都有素材」—— config 里的名字打错（窗会放空白，只能靠看门狗接回待机）
- 「工具/思考动画名都有素材且在干活/思考分类里」—— 状态帧播到不存在的素材
  （以前就有一个不存在的「搜寻中」，干活时宠物直接空白）
- 「分类 weight 合计 = 100 − idle − turn − move」「每个动作只归一处」—— 抽签权重不能漂

新素材走一遍：`gen-anim.cjs` 落 `assets/thumb/` → 选一类挂进 `categories`
（`kind` 决定语义：`eat` 吃 / `play` 玩 / `rest` 休息 / `work` 工作 / `think` 思考 /
`misc` 其它；吃/玩会**成组连播**，睡觉类记得同时加进 `sleep`）→ `node scripts/check-assets.cjs --write`
更新 sha256 清单 → 下面图库补一行 → `npm test`。


### 动画预览（图库 = 调用说明）

下面这张图库同时是**清单**：每行一个 `<img>` 指向 `assets/preview/<拼音>.gif`，
`npm test` 会盯着「preview 目录 ↔ README 图库 ↔「全部 N 个动画」三处一致」，
所以新素材漏了图库行，测试直接失败。

---

## 自定义大小

> 菜单里已经**不提供**换尺寸的入口（小/中/大）。下面的映射仍在用：默认尺寸走
> `assets/config.jsonc` 的 `pets[].size`，`/control {action:"set-ctrl", size, restartNonce}`
> 与 pi 的 `/pet small|large` 也能换。

大小映射定义在 `pi/assets/pet.js`（`SIZE_MAP`）与 `app/protocol.cjs`（`SIZES`）里，**两边必须一致**：

```js
var SIZE_MAP = { small: 380, normal: 400, large: 540 };
```

- **改数字** — 修改小/中/大的 px 宽度（高度自动 = 宽 × 9/16）。⚠️ 最小档别低于 380：舞台太窄时头顶气泡会被挤到屏幕边上，看着像被裁了一半
- **加档位** — 添加 `tiny`、`xlarge` 等新条目，例如 `{ tiny: 180, ..., xlarge: 720 }`（记得两处都改）

修改后 `/pet` 生效，新增命令（如 `/pet tiny`、`/pet xlarge`）自动可用。已开着的窗需要
`/pet` 或 `set-ctrl + restartNonce` 才换（都要换窗才生效）。

## 移动与位置记忆

浮窗**只包住宠物**（默认约 620×560，拿到配置后按「最大宠物 + 头顶气泡」重算），
不覆盖整块桌面 —— 见开头那条提示：全屏透明窗每帧都要 DWM 重合成整块桌面，会拖垮别的程序。

| 操作 | 效果 |
|------|------|
| **拖宠物** | 搬整扇窗（宠物在窗里的相对位置不变，看起来就是跟着手走）；松手时窗的落点记进 `stage.json`，下次启动还在那儿 |
| **拖到屏幕边** | 整扇窗出不了屏幕，于是「窗被夹住」的那份差额改由宠物在窗里挪（贴边=窗贴边+窗内贴边）；头顶留 150 的台子给气泡，所以最上边那 150px 拖不到 |
| **放到别的显示器** | 一样直接拖过去；显示器拔过/分辨率变过时旧坐标会自动夹回可见范围 |
| `POST /control {"action":"set-position"}` | 改宠物**在窗里**的站位（比例坐标，落盘 `positions.json`，与上面的窗位置记忆是两回事） |

窗位置记忆文件：`%APPDATA%/pi-dsh-pet/stage.json`（`{x, y}`，屏幕像素）。
删掉它就回到默认的右下角。

## 窗口残影（宠物周围一圈别的软件画面被锁住）—— 已定案

**现象**：拖动宠物时，它**身体周围的屏幕上留着一片别的东西当时的画面**，
宠物本体照常动，只有周围那一圈不动；鼠标点一下 / 把窗激活到前台才恢复。

**病根**（`PI_PET_SHAPE=0` 对照实测）：**Win32 的 `SetWindowRgn`**。
窗口区域一收窄，这扇窗就**不再覆盖**那块屏幕 —— 但 Win32 不会因为「这块不再被覆盖」
去让 DWM 重新合成底下的窗口，没人给它脏区，DWM 的合成缓存里就留着上一次的内容。
所以那片像素**根本不是这扇窗的**，`invalidate()` 对它无效。

**修法**（`995963f` + `a0c3f83`）：默认**不用窗口区域**，改用开关式穿透 ——
每 50ms 读一次 `screen.getCursorScreenPoint()`，光标进了宠物/气泡的矩形就
`setIgnoreMouseEvents(false)`，出去就开回来。判定在**主进程**做：
穿透开着时窗收不到鼠标事件，渲染进程那份判定靠转发过来的 move 消息，实测靠不住
（会变成「压在别的窗口上时拖不动、右键也弹不出来」）。

代价：光标进出宠物范围最多 50ms 延迟；`PI_PET_HOVER_POLL_MS` 可调。

### 这一路上试过但**没用**的（别再走一遍）

| 试法 | 结果 |
|------|------|
| `disable-features=CalculateNativeWinOcclusion` + `disable-backgrounding-occluded-windows` + `disable-renderer-backgrounding` | 无 |
| `webPreferences.backgroundThrottling: false` | 无 |
| `win.webContents.invalidate()`（形状/尺寸/位置变时、命中区每次上报时、400ms 兼底一次） | 无 —— 因为那片像素不属于本窗 |
| 窗宽按当前动画可见框收窄（`02fb97d`） | 无（但这条本身有用，保留） |
| 形状变小时先 `setShape` 成整窗再收回，逼 DWM 重合成（`e9f8f43`） | 无 —— 收窄就是收窄 |
| `PI_PET_SOFTWARE_COMPOSITE=1`（软件合成）、`PI_PET_TOPMODE=1/2/3`（screen-saver 层级 / 不置顶定时顶 / 不透明实底） | 没用上，留着当排查开关 |

开关一览（都只给窗进程，正常跑不用设）：

```sh
PI_PET_SPLIT_WINDOW=1       # 强制双进程（窗另开一个 Electron 实例；默认已融合）
PI_PET_SHAPE=1               # 回到窗口区域精确命中区（Windows 上会复现残影）
PI_PET_HOVER_POLL_MS=50      # 光标判定间隔（延迟 = 这个值）
PI_PET_REPAINT_MS=400        # 整窗重画的兼底间隔（0 关掉）
PI_PET_SHAPE_DIRTY=0         # 关掉「先盖满整窗再收回」的兼底（已知无效，留着 A/B）
PI_PET_SOFTWARE_COMPOSITE=1  # 走软件合成
PI_PET_TOPMODE=1|2|3         # screen-saver 层级 / 不置顶定时顶 / 不透明实底色
```

## 检查更新 / 自动更新

- **启动自动检查**：宿主起来 12s 后查一次，有新版就直接装上并换一扇窗（渲染层立刻用上新代码）；
  6h 内不重复查，全程只写日志**不弹窗**。
- **手动检查**：右键菜单「检查更新…」→ 有新版可以当场「现在更新」。
  也走同一套 API：`POST /control {"action":"check-update"}` → `{"action":"do-update"}`，
  结果也会落在 `GET /state` 的 `state.update` 里。

两种装法分别处理（`app/updater.cjs`）：

| 装法 | 怎么更 | 自动 |
|------|--------|------|
| git 检出（pi 扩展装法、`git clone`） | 镜像 `git fetch` 比远端 → `git merge --ff-only @{u}` | ✅ 全自动 |
| npm 全局装 | 查 registry → `npm i -g pi-dsh-pet@latest`（都带 `--registry=npmmirror`） | ✅ 全自动 |
| **单文件 exe（portable）** | 问 GitHub Releases 的 latest tag → 把新 exe 下到同目录，**退出后自动覆盖**（正在跑的 exe 是锁着的）。认法：env `PORTABLE_EXECUTABLE_FILE`（electron-builder 的启动器塞的）。自动更新只查不下载，125MB 不偷着下 | ⚠️ 只查 |
| npm 非全局装 / 解压即用 / asar 打包版 | **只报告当前版本和该去哪儿手动更**，不代劳 | ❌ |

几条硬规矩：**工作区脏（有本地改动）就拒绝自动更**（别让更新盖掉你的代码）、
**只用 `--ff-only`**（有分叉就报出来，不自动 merge）、**更新完宿主进程不换代码**
（它是 detached 的，没人负责再拉起它）—— 渲染层立刻生效，`app/*` 要下次 `pi-pet restart`。

开关（给测试和不喜欢自动更新的人）：

```sh
PI_PET_NO_UPDATE=1        # 全关（连启动时的自动检查也没有）
PI_PET_UPDATE=check       # 只查不装
PI_PET_UPDATE_NO_FETCH=1  # 查也不联网，只比本地已有的远端 ref（看「我落后几个提交」）
PI_PET_UPDATE_GAP_MS=…    # 自动检查的最小间隔（默认 6h）
PI_PET_UPDATE_DELAY_MS=…  # 启动后等多久再查（默认 12s，别跟起窗抢 IO）
PI_PET_GH_PROXY=…         # GitHub 代理前缀，逗号分隔（默认 ghfast.top,gh-proxy.com）；=off 只用直连
PI_PET_NPM_REGISTRY=…     # npm 镜像（默认 registry.npmmirror.com）；="" 只用官方
```

**国内加速**：GitHub 直连常年几十 KB/s，所以 `git fetch` / GitHub API / portable 的 exe 下载
都是给 URL 加代理前缀（`https://ghfast.top/https://github.com/...`），代理挂了自动退下一个，
最后一个永远是直连。git 那条只做 `fetch`，落地仍走本地 `git merge --ff-only @{u}` ——
ref 还是写回 `origin/main`，你的 git 配置一个字不用改。npm 同理：镜像上查不到（刚发布还没同步）
就回官方 registry。

## 待机节奏（动画被切一半 / 待机太短）

管两件事，**整段删掉也会用同样的默认值**：

```jsonc
"timing": {
  "minPlayMs": 7600,     // 一段动画最少播多久才允许被切走
  "idleDwellMs": 11000   // 待机片放完后原地续播多久，再抽下一个
}
```

| 参数 | 治什么 | 调 0 / 调大会怎样 |
|------|--------|------------------|
| `minPlayMs` | 鼠标扫过宠物（hover 移出就回待机）、拖拽落点回待机、待机链重抽，把正演到一半的动作从中间砍掉 —— 看着就是「动画没执行完就跳下一个」 | 0 = 回到「谁来都立刻切」的老行为；调大 = 一段动画更不容易被打断 |
| `idleDwellMs` | 权重是 `idle 10 / turn 5 / move 5 / action 80`，一段待机呼吸刚放完就有 90% 概率直接跳去演随机动作，宠物一直忙个不停 | 0 = 不停留（旧行为）；调大 = 每轮待机更长（加待机片本身约 10s+） |

前两个只管**被动**的切换：点一下、拖起来、拖完落回待机、以及 pi/dsh 的状态帧（思考中/写代码）
永远立刻生效，不受这两个数管 —— 状态必须马上反映到屏幕上。停留期间只要用户一动（点/拖）
或来了状态帧，待机立刻收摊。

### 省电 / 占用

- **宿主与窗融进同一个进程**：打包版里宿主本身就是 Electron 运行时，窗直接开在本进程
  （`app/window-inproc.cjs`），不再 spawn 第二个 Electron 实例 —— 少一个浏览器进程 +
  一个 GPU 进程 + 第二份 Chromium profile 缓存（进程 −2，内存 −100MB 上下）。
  窗还是那扇窗、素材还是那些 webm，**画质与事件面一字未改**（窗照样连宿主自己的
  127.0.0.1 端口）。纯 node（`npm start` / `pi-pet serve` / CI）仍走双进程。
- **不再有「空闲 N 秒自动冻住」**：宠物就该一直动，空闲也照常放（原 `timing.idleSleepMs` 已拿掉）。
- **窗看不见时自动停**：最小化 / 屏保锁屏 / 系统挂起 → 主进程直接喊它睡（不经过服务）。
- **手动省电模式：已屏蔽**（2026-10 起接口一律回「暂时屏蔽」，右键菜单里也没这一项）。
  代码没删，恢复只改一个总闸：`app/host.cjs` 顶上的 `POWER_SAVE_ENABLED = false` 改成 `true`。
  接口长这样（屏蔽期间调它得到 `{"ok":false,"error":"省电模式暂时屏蔽（宠物一直动）"}`）：

  | 调用 | 效果（恢复后） |
  |------|------|
  | `POST /control {"action":"power-save","on":true|false}` | 手动开关省电，落盘 `%APPDATA%/pi-dsh-pet/ctrl.json` 的 `powerSave`（换窗、重启都还保持着） |
  | `POST /control {"action":"set-ctrl","powerSave":true|false}` | 同上，set-ctrl 顺带改意图文件的那条路 |
  | `GET /state` 里的 `ctrl.powerSave` | 只读当前值 |

  开着时：动画冻在当前帧（`video.pause()`、停漫游 rAF、不再上报命中区），气泡文字照常更新、

  能「说点什么」；关掉即从当前帧无缝接着放（不跳回第一帧）。宿主会向窗补发
  `{"type":"power","sleep":true|false}` 帧，窗侧 `applyPowerFrame` 认这个帧。
- 漫游拖动时也掐着：窗内写样式/上报命中区封顶 30fps，主进程那次 `setShape` 有 2px 去重 +
  60ms 节流 —— 不动的宠物不该反复触发整屏重合成。

## 会话气泡（多开会话时，头顶一会话一格）

多开几个 pi / dsh / opencode 时，宠物头顶**每个会话一条气泡**，各写各的：

```
┌──────────────────────────┐
│ pi-dsh-pet        执行中 │   ← 蓝色角标 = 还在跑（点它没意义）
│ npm test                 │
└──────────────────────────┘
┌──────────────────────────┐
│ 写文档            已完成 │   ← 绿色角标 = 跑完了，**点一下就收掉**
│ README 改好了            │
└──────────────────────────┘
```

- **一条会话一格**：宿主按 `/feed` 连接分配 `sid`（`pi#1` / `pi#2`…），所以同开两个 pi
  是两格，不会挤成一条。同一会话的状态变化是**原地换**（执行中 → 已完成），
  不新冒第二条、位置也不跳。
- **标题**是生产者报上来的会话名：pi 扩展在 `session_start` 时报一次
  （能取到会话标题就用标题，取不到就用工作目录名），dsh 用配置里的 `title` 或工作目录名，
  opencode 用 session 标题 / 目录名。都没有就显示来源名（`pi` / `dsh` / `opencode`）。
- **会话退出就收**：那条会话的连接断了（pi 退出 / 换会话）或 120s 判死 ⇒ 那一格自动消失。
- **点已完成的也能收**：点一下本地收掉，并告诉宿主「别再发它」
  （`POST /control {"action":"dismiss-bubble","sid":"pi#1"}`）——
  不告诉宿主的话，换窗补发时它又会回来。下一轮真开工时气泡重新冒出来。
- 头顶空间不够时（贴上边 / 窗口小）优先收**已完成**的那几条，正在跑的留着。

协议（下行 `{"type":"session",...}`、上行 `{"type":"session","title":...}`）见
[DESIGN.md §3.2.3 / §4.4](./DESIGN.md)。

## 接自己的程序

宿主只听 127.0.0.1，token 在 `%APPDATA%/pi-dsh-pet/token`（`pi-pet token` 打印）。

**端口别写死**：默认 47653，**被占就换一个，并且记住换后的那个**（`%APPDATA%/pi-dsh-pet/port.keep`），
下次启动仍然先试它 —— 所以端口是固定的，不会每次启动都飘。当前真正在听的端口随时写在
`%APPDATA%/pi-dsh-pet/port`（一行纯文本，宿主每次起来就写、退出就删）。pi 扩展和 dsh 插件都走这条路：

```js
const port = fs.readFileSync(portFile, "utf8").trim(); // 例如 "12035"
const token = fs.readFileSync(tokenFile, "utf8").trim();
```

上行只有两种方式，语义完全一样：

```js
// 1) WS（推荐，能一直连着：**每条连接 = 一个会话 = 头顶一格气泡**）
const ws = new WebSocket(`ws://127.0.0.1:${port}/feed?source=my-tool&token=${token}`);
ws.onopen = () => {
  ws.send(JSON.stringify({ type: "session", title: "拉数据" }));     // 会话标题（只报一次）
  ws.send(JSON.stringify({ type: "thinking", task: "拉取数据" }));
  ws.send(JSON.stringify({ type: "tool_call", tool: "bash", detail: "npm run build" }));
  ws.send(JSON.stringify({ type: "done", summary: "构建完成" }));     // 那格变「已完成」
};                                                                      // 关掉 ws ⇒ 那格消失

// 2) REST（一次性）
await fetch(`http://127.0.0.1:${port}/event`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({ type: "thinking", task: "拉取数据" }),
});
```

`dsh/pi-pet.mjs` 就是这么接的（直接 `import` 丢进 dsh 插件目录即可）。协议细节（下行 v1/v1.1
帧格式、状态机、多会话语义、会话气泡）见 [DESIGN.md](./DESIGN.md)。

## 文档

- [设计与实现](DESIGN.md) —— 架构、协议 v1~v1.4、状态机与气泡（含每会话一条）、互斥四层、运维命令、已知坑

## 许可

- 代码：MIT
- 素材（动画/提示词/源视频）：允许开源使用，**禁止商用**