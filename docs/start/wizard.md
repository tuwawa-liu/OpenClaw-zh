---
summary: "CLI onboarding: guided setup for gateway, workspace, channels, and skills"
read_when:
  - Running or configuring CLI onboarding
  - Setting up a new machine
title: "Onboarding (CLI)"
sidebarTitle: "Onboarding: CLI"
---

# Onboarding (CLI)

CLI onboarding is the **recommended** way to set up OpenClaw on macOS,
Linux, or Windows (via WSL2; strongly recommended).
It configures a local Gateway or a remote Gateway connection, plus channels, skills,
and workspace defaults in one guided flow.

```bash
openclaw onboard
```

最快开始聊天的方式：打开控制界面（无需设置渠道）。运行 `openclaw dashboard` 并在浏览器中聊天。文档：[控制面板](/web/dashboard)。

后续重新配置：

```bash
openclaw configure
```

推荐：设置 Brave Search API 密钥，以便智能体可以使用 `web_search`（`web_fetch` 无需密钥即可使用）。最简单的方式：`openclaw configure --section web`，它会存储 `tools.web.search.apiKey`。文档：[Web 工具](/tools/web)。

## 快速开始 vs 高级

向导从**快速开始**（默认值）vs **高级**（完全控制）开始。

**快速开始**保持默认值：

- 本地 Gateway 网关（loopback）
- 默认工作区（或现有工作区）
- Gateway 网关端口 **18789**
- Gateway 网关认证 **Token**（自动生成，即使在 loopback 上）
- Tailscale 暴露 **关闭**
- Telegram + WhatsApp 私信默认使用**允许列表**（系统会提示你输入电话号码）

**高级**暴露每个步骤（模式、工作区、Gateway 网关、渠道、守护进程、Skills）。

## 向导做了什么

**本地模式（默认）**引导你完成：

- 模型/认证（OpenAI Code (Codex) 订阅 OAuth、Anthropic API 密钥（推荐）或 setup-token（粘贴），以及 MiniMax/GLM/Moonshot/AI Gateway 选项）
- 工作区位置 + 引导文件
- Gateway 网关设置（端口/绑定/认证/tailscale）
- 提供商（Telegram、WhatsApp、Discord、Google Chat、Mattermost（插件）、Signal）
- 守护进程安装（LaunchAgent / systemd 用户单元）
- 健康检查
- Skills（推荐）

**远程模式**仅配置本地客户端连接到其他位置的 Gateway 网关。
它**不会**在远程主机上安装或更改任何内容。

要添加更多隔离的智能体（独立的工作区 + 会话 + 认证），使用：

```bash
openclaw agents add <name>
```

提示：`--json` **不**意味着非交互模式。脚本中请使用 `--non-interactive`（和 `--workspace`）。

<Tip>
CLI onboarding includes a web search step where you can pick a provider
(Perplexity, Brave, Gemini, Grok, or Kimi) and paste your API key so the agent
can use `web_search`. You can also configure this later with
`openclaw configure --section web`. Docs: [Web tools](/tools/web).
</Tip>

1. **现有配置检测**
   - 如果 `~/.openclaw/openclaw.json` 存在，选择**保留 / 修改 / 重置**。
   - 重新运行向导**不会**清除任何内容，除非你明确选择**重置**（或传递 `--reset`）。
   - 如果配置无效或包含遗留键名，向导会停止并要求你在继续之前运行 `openclaw doctor`。
   - 重置使用 `trash`（永不使用 `rm`）并提供范围选项：
     - 仅配置
     - 配置 + 凭证 + 会话
     - 完全重置（同时删除工作区）

Onboarding starts with **QuickStart** (defaults) vs **Advanced** (full control).

<Tabs>
  <Tab title="QuickStart (defaults)">
    - Local gateway (loopback)
    - Workspace default (or existing workspace)
    - Gateway port **18789**
    - Gateway auth **Token** (auto‑generated, even on loopback)
    - Tool policy default for new local setups: `tools.profile: "coding"` (existing explicit profile is preserved)
    - DM isolation default: local onboarding writes `session.dmScope: "per-channel-peer"` when unset. Details: [CLI Setup Reference](/start/wizard-cli-reference#outputs-and-internals)
    - Tailscale exposure **Off**
    - Telegram + WhatsApp DMs default to **allowlist** (you'll be prompted for your phone number)
  </Tab>
  <Tab title="Advanced (full control)">
    - Exposes every step (mode, workspace, gateway, channels, daemon, skills).
  </Tab>
</Tabs>

## What onboarding configures

4. **Gateway 网关**
   - 端口、绑定、认证模式、tailscale 暴露。
   - 认证建议：即使对于 loopback 也保持 **Token**，以便本地 WS 客户端必须进行认证。
   - 仅当你完全信任每个本地进程时才禁用认证。
   - 非 loopback 绑定仍需要认证。

5. **渠道**
   - [WhatsApp](/channels/whatsapp)：可选的二维码登录。
   - [Telegram](/channels/telegram)：机器人令牌。
   - [Discord](/channels/discord)：机器人令牌。
   - [Google Chat](/channels/googlechat)：服务账户 JSON + webhook 受众。
   - [Mattermost](/channels/mattermost)（插件）：机器人令牌 + 基础 URL。
   - [Signal](/channels/signal)：可选的 `signal-cli` 安装 + 账户配置。
   - [iMessage](/channels/imessage)：本地 `imsg` CLI 路径 + 数据库访问。
   - 私信安全：默认为配对。第一条私信发送验证码；通过 `openclaw pairing approve <channel> <code>` 批准或使用允许列表。

<Note>
Re-running onboarding does **not** wipe anything unless you explicitly choose **Reset** (or pass `--reset`).
CLI `--reset` defaults to config, credentials, and sessions; use `--reset-scope full` to include workspace.
If the config is invalid or contains legacy keys, onboarding asks you to run `openclaw doctor` first.
</Note>

7. **健康检查**
   - 启动 Gateway 网关（如果需要）并运行 `openclaw health`。
   - 提示：`openclaw status --deep` 在状态输出中添加 Gateway 网关健康探测（需要可达的 Gateway 网关）。

8. **Skills（推荐）**
   - 读取可用的 Skills 并检查要求。
   - 让你选择节点管理器：**npm / pnpm**（不推荐 bun）。
   - 安装可选依赖项（某些在 macOS 上使用 Homebrew）。

Use `openclaw agents add <name>` to create a separate agent with its own workspace,
sessions, and auth profiles. Running without `--workspace` launches onboarding.

- 如果未检测到 GUI，向导会打印控制界面的 SSH 端口转发说明，而不是打开浏览器。
- 如果控制界面资源缺失，向导会尝试构建它们；回退方案是 `pnpm ui:build`（自动安装 UI 依赖）。

## 远程模式

远程模式配置本地客户端连接到其他位置的 Gateway 网关。

你将设置的内容：

- 远程 Gateway 网关 URL（`ws://...`）
- 如果远程 Gateway 网关需要认证则需要令牌（推荐）

注意事项：

- 不执行远程安装或守护进程更改。
- 如果 Gateway 网关仅限 loopback，使用 SSH 隧道或 tailnet。
- 发现提示：
  - macOS：Bonjour（`dns-sd`）
  - Linux：Avahi（`avahi-browse`）

## 添加另一个智能体

使用 `openclaw agents add <name>` 创建一个具有独立工作区、会话和认证配置文件的单独智能体。不带 `--workspace` 运行会启动向导。

它设置的内容：

- `agents.list[].name`
- `agents.list[].workspace`
- `agents.list[].agentDir`

注意事项：

- Default workspaces follow `~/.openclaw/workspace-<agentId>`.
- Add `bindings` to route inbound messages (onboarding can do this).
- Non-interactive flags: `--model`, `--agent-dir`, `--bind`, `--non-interactive`.

## 非交互模式

For detailed step-by-step breakdowns and config outputs, see
[CLI Setup Reference](/start/wizard-cli-reference).
For non-interactive examples, see [CLI Automation](/start/wizard-cli-automation).
For the deeper technical reference, including RPC details, see
[Onboarding Reference](/reference/wizard).

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice apiKey \
  --anthropic-api-key "$ANTHROPIC_API_KEY" \
  --gateway-port 18789 \
  --gateway-bind loopback \
  --install-daemon \
  --daemon-runtime node \
  --skip-skills
```

添加 `--json` 以获取机器可读的摘要。

Gemini 示例：

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice gemini-api-key \
  --gemini-api-key "$GEMINI_API_KEY" \
  --gateway-port 18789 \
  --gateway-bind loopback
```

Z.AI 示例：

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice zai-api-key \
  --zai-api-key "$ZAI_API_KEY" \
  --gateway-port 18789 \
  --gateway-bind loopback
```

Vercel AI Gateway 示例：

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice ai-gateway-api-key \
  --ai-gateway-api-key "$AI_GATEWAY_API_KEY" \
  --gateway-port 18789 \
  --gateway-bind loopback
```

Moonshot 示例：

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice moonshot-api-key \
  --moonshot-api-key "$MOONSHOT_API_KEY" \
  --gateway-port 18789 \
  --gateway-bind loopback
```

Synthetic 示例：

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice synthetic-api-key \
  --synthetic-api-key "$SYNTHETIC_API_KEY" \
  --gateway-port 18789 \
  --gateway-bind loopback
```

OpenCode Zen 示例：

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice opencode-zen \
  --opencode-zen-api-key "$OPENCODE_API_KEY" \
  --gateway-port 18789 \
  --gateway-bind loopback
```

添加智能体（非交互）示例：

```bash
openclaw agents add work \
  --workspace ~/.openclaw/workspace-work \
  --model openai/gpt-5.2 \
  --bind whatsapp:biz \
  --non-interactive \
  --json
```

## Gateway 网关向导 RPC

Gateway 网关通过 RPC 暴露向导流程（`wizard.start`、`wizard.next`、`wizard.cancel`、`wizard.status`）。
客户端（macOS 应用、控制界面）可以渲染步骤而无需重新实现新手引导逻辑。

## Signal 设置（signal-cli）

向导可以从 GitHub releases 安装 `signal-cli`：

- 下载适当的发布资源。
- 存储在 `~/.openclaw/tools/signal-cli/<version>/` 下。
- 将 `channels.signal.cliPath` 写入你的配置。

注意事项：

- JVM 构建需要 **Java 21**。
- 可用时使用原生构建。
- Windows 使用 WSL2；signal-cli 安装在 WSL 内遵循 Linux 流程。

## 向导写入的内容

`~/.openclaw/openclaw.json` 中的典型字段：

- `agents.defaults.workspace`
- `agents.defaults.model` / `models.providers`（如果选择了 Minimax）
- `gateway.*`（模式、绑定、认证、tailscale）
- `channels.telegram.botToken`、`channels.discord.token`、`channels.signal.*`、`channels.imessage.*`
- 当你在提示中选择加入时的渠道允许列表（Slack/Discord/Matrix/Microsoft Teams）（名称在可能时解析为 ID）。
- `skills.install.nodeManager`
- `wizard.lastRunAt`
- `wizard.lastRunVersion`
- `wizard.lastRunCommit`
- `wizard.lastRunCommand`
- `wizard.lastRunMode`

`openclaw agents add` 写入 `agents.list[]` 和可选的 `bindings`。

WhatsApp 凭证存储在 `~/.openclaw/credentials/whatsapp/<accountId>/` 下。
会话存储在 `~/.openclaw/agents/<agentId>/sessions/` 下。

某些渠道以插件形式提供。当你在新手引导期间选择一个时，向导会在配置之前提示安装它（npm 或本地路径）。

## 相关文档

- macOS 应用新手引导：[新手引导](/start/onboarding)
- 配置参考：[Gateway 网关配置](/gateway/configuration)
- 提供商：[WhatsApp](/channels/whatsapp)、[Telegram](/channels/telegram)、[Discord](/channels/discord)、[Google Chat](/channels/googlechat)、[Signal](/channels/signal)、[iMessage](/channels/imessage)
- Skills：[Skills](/tools/skills)、[Skills 配置](/tools/skills-config)
