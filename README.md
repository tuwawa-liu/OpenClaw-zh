# 🦞 OpenClaw 中文版 — 个人 AI 助手

<p align="center">
    <picture>
        <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text-dark.png">
        <img src="https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.png" alt="OpenClaw 中文版" width="500">
    </picture>
</p>

<p align="center">
  <strong>OpenClaw 完整中文汉化版本</strong>
</p>

<p align="center">
  <a href="https://github.com/tuwawa-liu/ChineseOpenClaw"><img src="https://img.shields.io/github/stars/tuwawa-liu/ChineseOpenClaw?style=for-the-badge" alt="GitHub Stars"></a>
  <a href="https://github.com/openclaw/openclaw/releases"><img src="https://img.shields.io/github/v/release/openclaw/openclaw?include_prereleases&style=for-the-badge&label=上游版本" alt="上游版本"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT 许可证"></a>
</p>

> 本项目是 [OpenClaw](https://github.com/openclaw/openclaw) 的完整中文汉化版本，包含界面、文档、CLI 输出的全面中文本地化。

**OpenClaw** 是一个运行在你自己设备上的 _个人 AI 助手_。
它可以在你日常使用的各种渠道（WhatsApp、Telegram、Slack、Discord、Google Chat、Signal、iMessage、BlueBubbles、IRC、Microsoft Teams、Matrix、飞书、LINE、Mattermost、Nextcloud Talk、Nostr、Synology Chat、Tlon、Twitch、Zalo、Zalo Personal、WebChat）上回复你。它可以在 macOS/iOS/Android 上进行语音对话，还可以渲染你控制的实时 Canvas。Gateway 只是控制平面——产品本身是助手。

如果你想要一个本地优先、快速且始终在线的个人单用户助手，这就是你需要的。

[上游项目](https://github.com/openclaw/openclaw) · [上游官网](https://openclaw.ai) · [上游文档](https://docs.openclaw.ai) · [愿景](VISION.md) · [快速入门](https://docs.openclaw.ai/start/getting-started)

推荐方式：从源码构建并运行入门向导（`openclaw onboard`）。
向导会逐步引导你完成 Gateway、工作区、频道和技能的配置。CLI 向导是推荐路径，适用于 **macOS、Linux 和 Windows（通过 WSL2；强烈推荐）**。
新用户？请参见下方"从源码构建"部分开始。

## 赞助商

本项目的赞助商来自上游 OpenClaw 项目：

| OpenAI                                                            | Vercel                                                            | Blacksmith                                                                   | Convex                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [![OpenAI](docs/assets/sponsors/openai.svg)](https://openai.com/) | [![Vercel](docs/assets/sponsors/vercel.svg)](https://vercel.com/) | [![Blacksmith](docs/assets/sponsors/blacksmith.svg)](https://blacksmith.sh/) | [![Convex](docs/assets/sponsors/convex.svg)](https://www.convex.dev/) |

**订阅（OAuth）：**

- **[OpenAI](https://openai.com/)**（ChatGPT/Codex）

模型说明：虽然支持许多提供商/模型，但为了获得最佳体验和降低提示注入风险，请使用你能获取到的最强最新一代模型。详见 [入门引导](https://docs.openclaw.ai/start/onboarding)。

## 模型（选择 + 认证）

- 模型配置 + CLI：[模型](https://docs.openclaw.ai/concepts/models)
- 认证配置轮换（OAuth vs API 密钥）+ 故障切换：[模型故障切换](https://docs.openclaw.ai/concepts/model-failover)

## 安装（推荐方式）

运行环境：**Node ≥22**。

本项目是 OpenClaw 的中文汉化 fork，请从源码安装：

```bash
git clone https://github.com/tuwawa-liu/ChineseOpenClaw.git
cd ChineseOpenClaw

npm install -g pnpm      # 安装 pnpm
pnpm install
pnpm ui:build
pnpm build

pnpm openclaw onboard --install-daemon
```

向导会安装 Gateway 守护进程（launchd/systemd 用户服务），使其持续运行。

## 卸载

如果需要彻底卸载（例如旧版本冲突），运行项目自带的卸载脚本：

```bash
bash uninstall-openclaw.sh
```

脚本会自动完成以下清理：

1. **停止并移除 launchd 守护进程**（`ai.openclaw.gateway`）
2. **终止残留的 openclaw 进程**
3. **卸载所有 Node 版本下的全局 npm 包**
4. **删除配置和数据目录**（`~/.openclaw`，配置文件会自动备份到 `~/openclaw.json.backup.*`）
5. **清除 npx 缓存**中的 openclaw 相关内容

卸载后如需重新安装，回到源码目录执行 `pnpm openclaw onboard --install-daemon` 即可。

## 快速开始（精简版）

运行环境：**Node ≥22**。

完整新手指南（认证、配对、频道）：[快速入门](https://docs.openclaw.ai/start/getting-started)

```bash
# 从源码构建后
pnpm openclaw onboard --install-daemon

pnpm openclaw gateway --port 18789 --verbose

# 发送消息
pnpm openclaw message send --to +1234567890 --message "你好，来自 OpenClaw 中文版"

# 与助手对话
pnpm openclaw agent --message "帮我整理一下今天的待办事项" --thinking high
```

升级？从上游同步最新代码并重新构建。

## 开发频道

上游 OpenClaw 的发布频道：

- **stable**：已标记的正式发布版本（`vYYYY.M.D` 或 `vYYYY.M.D-<patch>`）。
- **beta**：预发布标签（`vYYYY.M.D-beta.N`）。
- **dev**：跟随 `main` 分支头部。

本中文版跟随上游 `main` 分支同步更新。

## 从源码构建（开发）

推荐使用 `pnpm` 进行源码构建。Bun 可选用于直接运行 TypeScript。

```bash
git clone https://github.com/tuwawa-liu/ChineseOpenClaw.git
cd ChineseOpenClaw

npm install -g pnpm      # 安装 pnpm
pnpm install
pnpm ui:build # 首次运行时自动安装 UI 依赖
pnpm build

pnpm openclaw onboard --install-daemon

# 开发循环（TS 文件更改时自动重载）
pnpm gateway:watch
```

注意：`pnpm openclaw ...` 通过 `tsx` 直接运行 TypeScript。`pnpm build` 生成 `dist/` 目录，用于通过 Node / 打包后的 `openclaw` 二进制文件运行。

## 安全默认设置（私信访问）

OpenClaw 连接到真实的消息平台。将收到的私信视为 **不可信输入**。

完整安全指南：[安全](https://docs.openclaw.ai/gateway/security)

Telegram/WhatsApp/Signal/iMessage/Microsoft Teams/Discord/Google Chat/Slack 上的默认行为：

- **私信配对**（`dmPolicy="pairing"` / `channels.discord.dmPolicy="pairing"` / `channels.slack.dmPolicy="pairing"`；旧版：`channels.discord.dm.policy`、`channels.slack.dm.policy`）：未知发送者会收到一个简短的配对码，机器人不会处理他们的消息。
- 使用以下命令批准：`openclaw pairing approve <channel> <code>`（然后发送者会被添加到本地白名单存储中）。
- 公开接收私信需要明确选择启用：设置 `dmPolicy="open"` 并在频道白名单中包含 `"*"`（`allowFrom` / `channels.discord.allowFrom` / `channels.slack.allowFrom`；旧版：`channels.discord.dm.allowFrom`、`channels.slack.dm.allowFrom`）。

运行 `openclaw doctor` 来检查有风险/配置错误的私信策略。

## 亮点

- **[本地优先 Gateway](https://docs.openclaw.ai/gateway)** — 用于会话、频道、工具和事件的单一控制平面。
- **[多频道收件箱](https://docs.openclaw.ai/channels)** — WhatsApp、Telegram、Slack、Discord、Google Chat、Signal、BlueBubbles（iMessage）、iMessage（旧版）、IRC、Microsoft Teams、Matrix、飞书、LINE、Mattermost、Nextcloud Talk、Nostr、Synology Chat、Tlon、Twitch、Zalo、Zalo Personal、WebChat、macOS、iOS/Android。
- **[多智能体路由](https://docs.openclaw.ai/gateway/configuration)** — 将入站频道/账户/对等端路由到隔离的智能体（工作区 + 按智能体隔离的会话）。
- **[语音唤醒](https://docs.openclaw.ai/nodes/voicewake) + [通话模式](https://docs.openclaw.ai/nodes/talk)** — macOS/iOS 上的唤醒词和 Android 上的持续语音（ElevenLabs + 系统 TTS 回退）。
- **[实时 Canvas](https://docs.openclaw.ai/platforms/mac/canvas)** — 智能体驱动的可视化工作区，支持 [A2UI](https://docs.openclaw.ai/platforms/mac/canvas#canvas-a2ui)。
- **[一流的工具支持](https://docs.openclaw.ai/tools)** — 浏览器、Canvas、节点、定时任务、会话和 Discord/Slack 操作。
- **[配套应用](https://docs.openclaw.ai/platforms/macos)** — macOS 菜单栏应用 + iOS/Android [节点](https://docs.openclaw.ai/nodes)。
- **[入门向导](https://docs.openclaw.ai/start/wizard) + [技能](https://docs.openclaw.ai/tools/skills)** — 向导式配置，含内置/托管/工作区技能。

## Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=tuwawa-liu/ChineseOpenClaw&type=date&legend=top-left)](https://www.star-history.com/#tuwawa-liu/ChineseOpenClaw&type=date&legend=top-left)

## 我们目前构建的所有功能

### 核心平台

- [Gateway WebSocket 控制平面](https://docs.openclaw.ai/gateway)，包含会话、在线状态、配置、定时任务、Webhooks、[控制面板 UI](https://docs.openclaw.ai/web) 和 [Canvas 宿主](https://docs.openclaw.ai/platforms/mac/canvas#canvas-a2ui)。
- [CLI 界面](https://docs.openclaw.ai/tools/agent-send)：gateway、agent、send、[向导](https://docs.openclaw.ai/start/wizard) 和 [doctor](https://docs.openclaw.ai/gateway/doctor)。
- [Pi 智能体运行时](https://docs.openclaw.ai/concepts/agent)，RPC 模式，支持工具流式传输和块流式传输。
- [会话模型](https://docs.openclaw.ai/concepts/session)：`main` 用于直接聊天、群组隔离、激活模式、队列模式、回复转发。群组规则：[群组](https://docs.openclaw.ai/channels/groups)。
- [媒体管道](https://docs.openclaw.ai/nodes/images)：图片/音频/视频、转录钩子、大小限制、临时文件生命周期。音频详情：[音频](https://docs.openclaw.ai/nodes/audio)。

### 频道

- [频道](https://docs.openclaw.ai/channels)：[WhatsApp](https://docs.openclaw.ai/channels/whatsapp)（Baileys）、[Telegram](https://docs.openclaw.ai/channels/telegram)（grammY）、[Slack](https://docs.openclaw.ai/channels/slack)（Bolt）、[Discord](https://docs.openclaw.ai/channels/discord)（discord.js）、[Google Chat](https://docs.openclaw.ai/channels/googlechat)（Chat API）、[Signal](https://docs.openclaw.ai/channels/signal)（signal-cli）、[BlueBubbles](https://docs.openclaw.ai/channels/bluebubbles)（iMessage，推荐）、[iMessage](https://docs.openclaw.ai/channels/imessage)（旧版 imsg）、[IRC](https://docs.openclaw.ai/channels/irc)、[Microsoft Teams](https://docs.openclaw.ai/channels/msteams)、[Matrix](https://docs.openclaw.ai/channels/matrix)、[飞书](https://docs.openclaw.ai/channels/feishu)、[LINE](https://docs.openclaw.ai/channels/line)、[Mattermost](https://docs.openclaw.ai/channels/mattermost)、[Nextcloud Talk](https://docs.openclaw.ai/channels/nextcloud-talk)、[Nostr](https://docs.openclaw.ai/channels/nostr)、[Synology Chat](https://docs.openclaw.ai/channels/synology-chat)、[Tlon](https://docs.openclaw.ai/channels/tlon)、[Twitch](https://docs.openclaw.ai/channels/twitch)、[Zalo](https://docs.openclaw.ai/channels/zalo)、[Zalo Personal](https://docs.openclaw.ai/channels/zalouser)、[WebChat](https://docs.openclaw.ai/web/webchat)。
- [群组路由](https://docs.openclaw.ai/channels/group-messages)：提及门控、回复标签、按频道分块和路由。频道规则：[频道](https://docs.openclaw.ai/channels)。

### 应用 + 节点

- [macOS 应用](https://docs.openclaw.ai/platforms/macos)：菜单栏控制平面、[语音唤醒](https://docs.openclaw.ai/nodes/voicewake)/按键通话、[通话模式](https://docs.openclaw.ai/nodes/talk)覆盖层、[WebChat](https://docs.openclaw.ai/web/webchat)、调试工具、[远程 Gateway](https://docs.openclaw.ai/gateway/remote) 控制。
- [iOS 节点](https://docs.openclaw.ai/platforms/ios)：[Canvas](https://docs.openclaw.ai/platforms/mac/canvas)、[语音唤醒](https://docs.openclaw.ai/nodes/voicewake)、[通话模式](https://docs.openclaw.ai/nodes/talk)、相机、屏幕录制、Bonjour + 设备配对。
- [Android 节点](https://docs.openclaw.ai/platforms/android)：连接标签（设置码/手动）、聊天会话、语音标签、[Canvas](https://docs.openclaw.ai/platforms/mac/canvas)、相机/屏幕录制和 Android 设备命令（通知/位置/短信/照片/联系人/日历/运动/应用更新）。
- [macOS 节点模式](https://docs.openclaw.ai/nodes)：system.run/notify + canvas/相机暴露。

### 工具 + 自动化

- [浏览器控制](https://docs.openclaw.ai/tools/browser)：专用 openclaw Chrome/Chromium、快照、操作、上传、配置文件。
- [Canvas](https://docs.openclaw.ai/platforms/mac/canvas)：[A2UI](https://docs.openclaw.ai/platforms/mac/canvas#canvas-a2ui) 推送/重置、eval、快照。
- [节点](https://docs.openclaw.ai/nodes)：相机拍照/录制、屏幕录制、[location.get](https://docs.openclaw.ai/nodes/location-command)、通知。
- [定时任务 + 唤醒](https://docs.openclaw.ai/automation/cron-jobs)；[Webhooks](https://docs.openclaw.ai/automation/webhook)；[Gmail Pub/Sub](https://docs.openclaw.ai/automation/gmail-pubsub)。
- [技能平台](https://docs.openclaw.ai/tools/skills)：内置、托管和工作区技能，支持安装门控 + UI。

### 运行时 + 安全

- [频道路由](https://docs.openclaw.ai/channels/channel-routing)、[重试策略](https://docs.openclaw.ai/concepts/retry) 和 [流式传输/分块](https://docs.openclaw.ai/concepts/streaming)。
- [在线状态](https://docs.openclaw.ai/concepts/presence)、[输入指示器](https://docs.openclaw.ai/concepts/typing-indicators) 和 [用量追踪](https://docs.openclaw.ai/concepts/usage-tracking)。
- [模型](https://docs.openclaw.ai/concepts/models)、[模型故障切换](https://docs.openclaw.ai/concepts/model-failover) 和 [会话修剪](https://docs.openclaw.ai/concepts/session-pruning)。
- [安全](https://docs.openclaw.ai/gateway/security) 和 [故障排除](https://docs.openclaw.ai/channels/troubleshooting)。

### 运维 + 打包

- [控制面板 UI](https://docs.openclaw.ai/web) + [WebChat](https://docs.openclaw.ai/web/webchat) 直接从 Gateway 提供服务。
- [Tailscale Serve/Funnel](https://docs.openclaw.ai/gateway/tailscale) 或 [SSH 隧道](https://docs.openclaw.ai/gateway/remote)，支持令牌/密码认证。
- [Nix 模式](https://docs.openclaw.ai/install/nix)，声明式配置；[Docker](https://docs.openclaw.ai/install/docker) 安装方式。
- [Doctor](https://docs.openclaw.ai/gateway/doctor) 迁移、[日志](https://docs.openclaw.ai/logging)。

## 工作原理（简述）

```
WhatsApp / Telegram / Slack / Discord / Google Chat / Signal / iMessage / BlueBubbles / IRC / Microsoft Teams / Matrix / 飞书 / LINE / Mattermost / Nextcloud Talk / Nostr / Synology Chat / Tlon / Twitch / Zalo / Zalo Personal / WebChat
               │
               ▼
┌───────────────────────────────┐
│            Gateway            │
│         （控制平面）            │
│     ws://127.0.0.1:18789      │
└──────────────┬────────────────┘
               │
               ├─ Pi 智能体（RPC）
               ├─ CLI（openclaw …）
               ├─ WebChat UI
               ├─ macOS 应用
               └─ iOS / Android 节点
```

## 关键子系统

- **[Gateway WebSocket 网络](https://docs.openclaw.ai/concepts/architecture)** — 面向客户端、工具和事件的单一 WS 控制平面（运维：[Gateway 运行手册](https://docs.openclaw.ai/gateway)）。
- **[Tailscale 公开](https://docs.openclaw.ai/gateway/tailscale)** — 面向 Gateway 仪表盘 + WS 的 Serve/Funnel（远程访问：[远程](https://docs.openclaw.ai/gateway/remote)）。
- **[浏览器控制](https://docs.openclaw.ai/tools/browser)** — openclaw 托管的 Chrome/Chromium，通过 CDP 控制。
- **[Canvas + A2UI](https://docs.openclaw.ai/platforms/mac/canvas)** — 智能体驱动的可视化工作区（A2UI 宿主：[Canvas/A2UI](https://docs.openclaw.ai/platforms/mac/canvas#canvas-a2ui)）。
- **[语音唤醒](https://docs.openclaw.ai/nodes/voicewake) + [通话模式](https://docs.openclaw.ai/nodes/talk)** — macOS/iOS 上的唤醒词加 Android 上的持续语音。
- **[节点](https://docs.openclaw.ai/nodes)** — Canvas、相机拍照/录制、屏幕录制、`location.get`、通知，以及 macOS 专有的 `system.run`/`system.notify`。

## Tailscale 访问（Gateway 仪表盘）

OpenClaw 可以自动配置 Tailscale **Serve**（仅限尾网，tailnet-only）或 **Funnel**（公开），同时 Gateway 保持绑定到回环地址。配置 `gateway.tailscale.mode`：

- `off`：不自动配置 Tailscale（默认）。
- `serve`：通过 `tailscale serve` 提供仅限尾网的 HTTPS（默认使用 Tailscale 身份头）。
- `funnel`：通过 `tailscale funnel` 提供公开 HTTPS（需要共享密码认证）。

注意事项：

- 启用 Serve/Funnel 时，`gateway.bind` 必须保持为 `loopback`（OpenClaw 会强制执行）。
- 可通过设置 `gateway.auth.mode: "password"` 或 `gateway.auth.allowTailscale: false` 强制 Serve 也需要密码。
- Funnel 在未设置 `gateway.auth.mode: "password"` 时拒绝启动。
- 可选：`gateway.tailscale.resetOnExit` 在关闭时撤销 Serve/Funnel。

详情：[Tailscale 指南](https://docs.openclaw.ai/gateway/tailscale) · [Web 界面](https://docs.openclaw.ai/web)

## 远程 Gateway（Linux 很好用）

将 Gateway 运行在小型 Linux 实例上完全没问题。客户端（macOS 应用、CLI、WebChat）可以通过 **Tailscale Serve/Funnel** 或 **SSH 隧道** 连接，你仍然可以配对设备节点（macOS/iOS/Android）来执行设备本地操作。

- **Gateway 主机** 默认运行 exec 工具和频道连接。
- **设备节点** 通过 `node.invoke` 运行设备本地操作（`system.run`、相机、屏幕录制、通知）。
  简言之：exec 在 Gateway 所在位置运行；设备操作在设备所在位置运行。

详情：[远程访问](https://docs.openclaw.ai/gateway/remote) · [节点](https://docs.openclaw.ai/nodes) · [安全](https://docs.openclaw.ai/gateway/security)

## macOS 权限 — 通过 Gateway 协议

macOS 应用可以运行在 **节点模式** 下，通过 Gateway WebSocket（`node.list` / `node.describe`）广播其能力 + 权限映射。客户端可以通过 `node.invoke` 执行本地操作：

- `system.run` 运行本地命令并返回 stdout/stderr/exit code；设置 `needsScreenRecording: true` 以要求屏幕录制权限（否则会收到 `PERMISSION_MISSING`）。
- `system.notify` 发布用户通知，如果通知被拒绝则失败。
- `canvas.*`、`camera.*`、`screen.record` 和 `location.get` 也通过 `node.invoke` 路由，并遵循 TCC 权限状态。

提升的 bash（主机权限）与 macOS TCC 是分开的：

- 使用 `/elevated on|off` 在启用 + 白名单的情况下切换每会话的提升访问。
- Gateway 通过 `sessions.patch`（WS 方法）持久化每会话切换，包括 `thinkingLevel`、`verboseLevel`、`model`、`sendPolicy` 和 `groupActivation`。

详情：[节点](https://docs.openclaw.ai/nodes) · [macOS 应用](https://docs.openclaw.ai/platforms/macos) · [Gateway 协议](https://docs.openclaw.ai/concepts/architecture)

## 智能体间通信（sessions\_\* 工具）

- 使用这些工具在会话间协调工作，无需在聊天界面之间切换。
- `sessions_list` — 发现活动会话（智能体）及其元数据。
- `sessions_history` — 获取会话的对话记录。
- `sessions_send` — 向另一个会话发送消息；可选的回复乒乓 + 通告步骤（`REPLY_SKIP`、`ANNOUNCE_SKIP`）。

详情：[会话工具](https://docs.openclaw.ai/concepts/session-tool)

## 技能注册表（ClawHub）

ClawHub 是一个极简的技能注册表。启用 ClawHub 后，智能体可以自动搜索技能并按需引入新的技能。

[ClawHub](https://clawhub.com)

## 聊天命令

在 WhatsApp/Telegram/Slack/Google Chat/Microsoft Teams/WebChat 中发送以下命令（群组命令仅限所有者）：

- `/status` — 紧凑的会话状态（模型 + 令牌数，可用时显示费用）
- `/new` 或 `/reset` — 重置会话
- `/compact` — 压缩会话上下文（摘要）
- `/think <level>` — off|minimal|low|medium|high|xhigh（仅 GPT-5.2 + Codex 模型）
- `/verbose on|off`
- `/usage off|tokens|full` — 每条回复的用量页脚
- `/restart` — 重启 Gateway（群组中仅限所有者）
- `/activation mention|always` — 群组激活切换（仅限群组）

## 应用（可选）

Gateway 本身就能提供出色的体验。所有应用都是可选的，提供额外功能。

如果你计划构建/运行配套应用，请参阅以下平台指南。

### macOS (OpenClaw.app)（可选）

- Gateway 的菜单栏控制和健康监控。
- 语音唤醒 + 按键通话覆盖层。
- WebChat + 调试工具。
- 通过 SSH 远程控制 Gateway。

注意：macOS 权限需要签名构建才能在重新构建后保持有效（参见 `docs/mac/permissions.md`）。

### iOS 节点（可选）

- 通过 Gateway WebSocket 作为节点配对（设备配对）。
- 语音触发转发 + Canvas 界面。
- 通过 `openclaw nodes …` 控制。

指南：[iOS 连接](https://docs.openclaw.ai/platforms/ios)。

### Android 节点（可选）

- 通过设备配对（`openclaw devices ...`）作为 WS 节点配对。
- 提供 连接/聊天/语音 标签页加 Canvas、相机、屏幕捕获和 Android 设备命令系列。
- 指南：[Android 连接](https://docs.openclaw.ai/platforms/android)。

## 智能体工作区 + 技能

- 工作区根目录：`~/.openclaw/workspace`（可通过 `agents.defaults.workspace` 配置）。
- 注入的提示文件：`AGENTS.md`、`SOUL.md`、`TOOLS.md`。
- 技能：`~/.openclaw/workspace/skills/<skill>/SKILL.md`。

## 配置

最小 `~/.openclaw/openclaw.json`（模型 + 默认设置）：

```json5
{
  agent: {
    model: "anthropic/claude-opus-4-6",
  },
}
```

[完整配置参考（所有键 + 示例）。](https://docs.openclaw.ai/gateway/configuration)

## 安全模型（重要）

- **默认：** 工具在主机上为 **main** 会话运行，因此当只有你一个用户时，智能体拥有完全访问权限。
- **群组/频道安全：** 设置 `agents.defaults.sandbox.mode: "non-main"` 以在 **非 main 会话**（群组/频道）中运行 Docker 沙箱；bash 在这些会话中在 Docker 内运行。
- **沙箱默认设置：** 白名单 `bash`、`process`、`read`、`write`、`edit`、`sessions_list`、`sessions_history`、`sessions_send`、`sessions_spawn`；黑名单 `browser`、`canvas`、`nodes`、`cron`、`discord`、`gateway`。

详情：[安全指南](https://docs.openclaw.ai/gateway/security) · [Docker + 沙箱](https://docs.openclaw.ai/install/docker) · [沙箱配置](https://docs.openclaw.ai/gateway/configuration)

### [WhatsApp](https://docs.openclaw.ai/channels/whatsapp)

- 链接设备：`pnpm openclaw channels login`（凭证存储在 `~/.openclaw/credentials`）。
- 通过 `channels.whatsapp.allowFrom` 设置谁可以与助手对话的白名单。
- 如果设置了 `channels.whatsapp.groups`，它将成为群组白名单；包含 `"*"` 以允许所有群组。

### [Telegram](https://docs.openclaw.ai/channels/telegram)

- 设置 `TELEGRAM_BOT_TOKEN` 或 `channels.telegram.botToken`（环境变量优先）。
- 可选：设置 `channels.telegram.groups`（含 `channels.telegram.groups."*".requireMention`）；设置后它成为群组白名单（包含 `"*"` 以允许所有）。可选设置 `channels.telegram.allowFrom` 或 `channels.telegram.webhookUrl` + `channels.telegram.webhookSecret`。

```json5
{
  channels: {
    telegram: {
      botToken: "123456:ABCDEF",
    },
  },
}
```

### [Slack](https://docs.openclaw.ai/channels/slack)

- 设置 `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN`（或 `channels.slack.botToken` + `channels.slack.appToken`）。

### [Discord](https://docs.openclaw.ai/channels/discord)

- 设置 `DISCORD_BOT_TOKEN` 或 `channels.discord.token`（环境变量优先）。
- 可选：设置 `commands.native`、`commands.text` 或 `commands.useAccessGroups`，以及 `channels.discord.allowFrom`、`channels.discord.guilds` 或 `channels.discord.mediaMaxMb`。

```json5
{
  channels: {
    discord: {
      token: "1234abcd",
    },
  },
}
```

### [Signal](https://docs.openclaw.ai/channels/signal)

- 需要 `signal-cli` 和 `channels.signal` 配置部分。

### [BlueBubbles (iMessage)](https://docs.openclaw.ai/channels/bluebubbles)

- **推荐的** iMessage 集成方式。
- 配置 `channels.bluebubbles.serverUrl` + `channels.bluebubbles.password` 和 webhook（`channels.bluebubbles.webhookPath`）。
- BlueBubbles 服务器运行在 macOS 上；Gateway 可以运行在 macOS 或其他位置。

### [iMessage（旧版）](https://docs.openclaw.ai/channels/imessage)

- 旧版仅限 macOS 的集成，通过 `imsg`（需要登录"信息" app）。
- 如果设置了 `channels.imessage.groups`，它将成为群组白名单；包含 `"*"` 以允许所有。

### [Microsoft Teams](https://docs.openclaw.ai/channels/msteams)

- 配置 Teams 应用 + Bot Framework，然后添加 `msteams` 配置部分。
- 通过 `msteams.allowFrom` 设置白名单；群组访问通过 `msteams.groupAllowFrom` 或 `msteams.groupPolicy: "open"`。

### [WebChat](https://docs.openclaw.ai/web/webchat)

- 使用 Gateway WebSocket；不需要单独的 WebChat 端口/配置。

浏览器控制（可选）：

```json5
{
  browser: {
    enabled: true,
    color: "#FF4500",
  },
}
```

## 文档

通过入门流程后，使用以下文档获取更深入的参考。

- [从文档索引开始导航，了解 "什么在哪里"。](https://docs.openclaw.ai)
- [阅读架构概览，了解 Gateway + 协议模型。](https://docs.openclaw.ai/concepts/architecture)
- [使用完整配置参考查阅每个配置键和示例。](https://docs.openclaw.ai/gateway/configuration)
- [按照运行手册规范运行 Gateway。](https://docs.openclaw.ai/gateway)
- [了解控制面板 UI/Web 界面如何工作以及如何安全地公开它们。](https://docs.openclaw.ai/web)
- [了解通过 SSH 隧道或尾网的远程访问。](https://docs.openclaw.ai/gateway/remote)
- [跟随入门向导流程进行引导式配置。](https://docs.openclaw.ai/start/wizard)
- [通过 Webhook 界面接入外部触发器。](https://docs.openclaw.ai/automation/webhook)
- [设置 Gmail Pub/Sub 触发器。](https://docs.openclaw.ai/automation/gmail-pubsub)
- [了解 macOS 菜单栏配套应用详情。](https://docs.openclaw.ai/platforms/mac/menu-bar)
- [平台指南：Windows（WSL2）](https://docs.openclaw.ai/platforms/windows)、[Linux](https://docs.openclaw.ai/platforms/linux)、[macOS](https://docs.openclaw.ai/platforms/macos)、[iOS](https://docs.openclaw.ai/platforms/ios)、[Android](https://docs.openclaw.ai/platforms/android)
- [通过故障排除指南调试常见问题。](https://docs.openclaw.ai/channels/troubleshooting)
- [在公开任何内容之前查阅安全指南。](https://docs.openclaw.ai/gateway/security)

## 高级文档（发现 + 控制）

- [发现 + 传输](https://docs.openclaw.ai/gateway/discovery)
- [Bonjour/mDNS](https://docs.openclaw.ai/gateway/bonjour)
- [Gateway 配对](https://docs.openclaw.ai/gateway/pairing)
- [远程 Gateway README](https://docs.openclaw.ai/gateway/remote-gateway-readme)
- [控制面板 UI](https://docs.openclaw.ai/web/control-ui)
- [仪表盘](https://docs.openclaw.ai/web/dashboard)

## 运维与故障排除

- [健康检查](https://docs.openclaw.ai/gateway/health)
- [Gateway 锁](https://docs.openclaw.ai/gateway/gateway-lock)
- [后台进程](https://docs.openclaw.ai/gateway/background-process)
- [浏览器故障排除（Linux）](https://docs.openclaw.ai/tools/browser-linux-troubleshooting)
- [日志](https://docs.openclaw.ai/logging)

## 深入解读

- [智能体循环](https://docs.openclaw.ai/concepts/agent-loop)
- [在线状态](https://docs.openclaw.ai/concepts/presence)
- [TypeBox schema](https://docs.openclaw.ai/concepts/typebox)
- [RPC 适配器](https://docs.openclaw.ai/reference/rpc)
- [队列](https://docs.openclaw.ai/concepts/queue)

## 工作区与技能

- [技能配置](https://docs.openclaw.ai/tools/skills-config)
- [默认 AGENTS](https://docs.openclaw.ai/reference/AGENTS.default)
- [模板：AGENTS](https://docs.openclaw.ai/reference/templates/AGENTS)
- [模板：BOOTSTRAP](https://docs.openclaw.ai/reference/templates/BOOTSTRAP)
- [模板：IDENTITY](https://docs.openclaw.ai/reference/templates/IDENTITY)
- [模板：SOUL](https://docs.openclaw.ai/reference/templates/SOUL)
- [模板：TOOLS](https://docs.openclaw.ai/reference/templates/TOOLS)
- [模板：USER](https://docs.openclaw.ai/reference/templates/USER)

## 平台内部

- [macOS 开发环境设置](https://docs.openclaw.ai/platforms/mac/dev-setup)
- [macOS 菜单栏](https://docs.openclaw.ai/platforms/mac/menu-bar)
- [macOS 语音唤醒](https://docs.openclaw.ai/platforms/mac/voicewake)
- [iOS 节点](https://docs.openclaw.ai/platforms/ios)
- [Android 节点](https://docs.openclaw.ai/platforms/android)
- [Windows（WSL2）](https://docs.openclaw.ai/platforms/windows)
- [Linux 应用](https://docs.openclaw.ai/platforms/linux)

## 邮件钩子（Gmail）

- [docs.openclaw.ai/gmail-pubsub](https://docs.openclaw.ai/automation/gmail-pubsub)

## 关于本项目

本项目是 OpenClaw 的完整中文汉化版本，由 [@tuwawa-liu](https://github.com/tuwawa-liu) 维护。

汉化内容包括：

- 用户界面（Web UI、CLI 输出）
- 全部文档（350+ 文档文件）
- README、CONTRIBUTING、SECURITY、VISION 等项目文件

上游项目由 Peter Steinberger 和社区共同打造：

- [上游仓库](https://github.com/openclaw/openclaw)
- [openclaw.ai](https://openclaw.ai)

## 社区

参见 [CONTRIBUTING.md](CONTRIBUTING.md) 了解指南、维护者信息和提交 PR 的方式。
