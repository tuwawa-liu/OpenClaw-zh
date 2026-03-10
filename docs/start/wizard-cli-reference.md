---
summary: "`openclaw onboard` CLI 入门流程、认证/模型设置、输出和内部原理的完整参考"
read_when:
  - 需要 openclaw onboard 的详细行为
  - 调试入门结果或集成入门客户端
title: "CLI 入门参考"
sidebarTitle: "CLI 参考"
---

# CLI 入门参考

本页是 `openclaw onboard` 的完整参考。
简短指南请参阅[入门向导 (CLI)](/start/wizard)。

## 向导功能

本地模式（默认）引导您完成：

- 模型和认证设置（OpenAI Code 订阅 OAuth、Anthropic API 密钥或设置令牌，以及 MiniMax、GLM、Moonshot 和 AI Gateway 选项）
- 工作区位置和引导文件
- Gateway 设置（端口、绑定、认证、tailscale）
- 频道和提供商（Telegram、WhatsApp、Discord、Google Chat、Mattermost 插件、Signal）
- 守护进程安装（LaunchAgent 或 systemd 用户单元）
- 健康检查
- 技能设置

远程模式配置本机连接到其他位置的 Gateway。
它不会在远程主机上安装或修改任何内容。

## 本地流程详情

<Steps>
  <Step title="现有配置检测">
    - 如果 `~/.openclaw/openclaw.json` 存在，选择保留、修改或重置。
    - 重新运行向导不会清除任何内容，除非您明确选择重置（或传递 `--reset`）。
    - CLI `--reset` 默认范围为 `config+creds+sessions`；使用 `--reset-scope full` 同时移除工作区。
    - 如果配置无效或包含旧版键，向导会停止并要求您在继续之前运行 `openclaw doctor`。
    - 重置使用 `trash` 并提供范围选择：
      - 仅配置
      - 配置 + 凭证 + 会话
      - 完全重置（同时移除工作区）
  </Step>
  <Step title="模型和认证">
    - 完整选项矩阵请参阅[认证和模型选项](#认证和模型选项)。
  </Step>
  <Step title="工作区">
    - 默认 `~/.openclaw/workspace`（可配置）。
    - 生成首次运行引导仪式所需的工作区文件。
    - 工作区布局：[智能体工作区](/concepts/agent-workspace)。
  </Step>
  <Step title="Gateway">
    - 提示端口、绑定、认证模式和 tailscale 暴露。
    - 建议：即使在回环接口上也保持令牌认证，以便本地 WS 客户端必须认证。
    - 在令牌模式下，交互式入门提供：
      - **生成/存储明文令牌**（默认）
      - **使用 SecretRef**（可选）
    - 在密码模式下，交互式入门也支持明文或 SecretRef 存储。
    - 非交互式令牌 SecretRef 路径：`--gateway-token-ref-env <ENV_VAR>`。
      - 要求入门进程环境中存在非空环境变量。
      - 不能与 `--gateway-token` 组合使用。
    - 仅在完全信任每个本地进程时才禁用认证。
    - 非回环绑定仍需要认证。
  </Step>
  <Step title="频道">
    - [WhatsApp](/channels/whatsapp)：可选二维码登录
    - [Telegram](/channels/telegram)：机器人令牌
    - [Discord](/channels/discord)：机器人令牌
    - [Google Chat](/channels/googlechat)：服务账号 JSON + webhook 受众
    - [Mattermost](/channels/mattermost) 插件：机器人令牌 + 基础 URL
    - [Signal](/channels/signal)：可选 `signal-cli` 安装 + 账号配置
    - [BlueBubbles](/channels/bluebubbles)：推荐用于 iMessage；服务器 URL + 密码 + webhook
    - [iMessage](/channels/imessage)：旧版 `imsg` CLI 路径 + 数据库访问
    - DM 安全：默认为配对模式。首次 DM 发送一个代码；通过
      `openclaw pairing approve <channel> <code>` 批准或使用允许列表。
  </Step>
  <Step title="守护进程安装">
    - macOS：LaunchAgent
      - 需要已登录的用户会话；对于无头环境，使用自定义 LaunchDaemon（未随附）。
    - Linux 和通过 WSL2 的 Windows：systemd 用户单元
      - 向导尝试 `loginctl enable-linger <user>` 以便 Gateway 在登出后保持运行。
      - 可能提示 sudo（写入 `/var/lib/systemd/linger`）；它会先尝试不使用 sudo。
    - 运行时选择：Node（推荐；WhatsApp 和 Telegram 必需）。不建议使用 Bun。
  </Step>
  <Step title="健康检查">
    - 启动 Gateway（如需要）并运行 `openclaw health`。
    - `openclaw status --deep` 在状态输出中添加 Gateway 健康探针。
  </Step>
  <Step title="技能">
    - 读取可用技能并检查依赖。
    - 让您选择包管理器：npm 或 pnpm（不建议使用 bun）。
    - 安装可选依赖（某些在 macOS 上使用 Homebrew）。
  </Step>
  <Step title="完成">
    - 摘要和后续步骤，包括 iOS、Android 和 macOS 应用选项。
  </Step>
</Steps>

<Note>
如果未检测到 GUI，向导会打印 SSH 端口转发说明用于控制 UI，而不是打开浏览器。
如果控制 UI 资源缺失，向导会尝试构建它们；回退方案是 `pnpm ui:build`（自动安装 UI 依赖）。
</Note>

## 远程模式详情

远程模式配置本机连接到其他位置的 Gateway。

<Info>
远程模式不会在远程主机上安装或修改任何内容。
</Info>

设置内容：

- 远程 Gateway URL (`ws://...`)
- 如果远程 Gateway 认证已启用则需要令牌（推荐）

<Note>
- 如果 Gateway 仅绑定回环接口，使用 SSH 隧道或 tailnet。
- 发现提示：
  - macOS：Bonjour (`dns-sd`)
  - Linux：Avahi (`avahi-browse`)
</Note>

## 认证和模型选项

<AccordionGroup>
  <Accordion title="Anthropic API 密钥">
    如果存在则使用 `ANTHROPIC_API_KEY`，否则提示输入密钥，然后保存供守护进程使用。
  </Accordion>
  <Accordion title="Anthropic OAuth (Claude Code CLI)">
    - macOS：检查钥匙串项目 "Claude Code-credentials"
    - Linux 和 Windows：如果存在则复用 `~/.claude/.credentials.json`

    在 macOS 上，选择"始终允许"以便 launchd 启动不会阻塞。

  </Accordion>
  <Accordion title="Anthropic 令牌（setup-token 粘贴）">
    在任意机器上运行 `claude setup-token`，然后粘贴令牌。
    可以命名；留空使用默认名。
  </Accordion>
  <Accordion title="OpenAI Code 订阅（Codex CLI 复用）">
    如果 `~/.codex/auth.json` 存在，向导可以复用它。
  </Accordion>
  <Accordion title="OpenAI Code 订阅（OAuth）">
    浏览器流程；粘贴 `code#state`。

    当模型未设置或为 `openai/*` 时，将 `agents.defaults.model` 设置为 `openai-codex/gpt-5.3-codex`。

  </Accordion>
  <Accordion title="OpenAI API 密钥">
    如果存在则使用 `OPENAI_API_KEY`，否则提示输入密钥，然后将凭证存储在认证配置文件中。

    当模型未设置、为 `openai/*` 或 `openai-codex/*` 时，将 `agents.defaults.model` 设置为 `openai/gpt-5.1-codex`。

  </Accordion>
  <Accordion title="xAI (Grok) API 密钥">
    提示输入 `XAI_API_KEY` 并配置 xAI 作为模型提供商。
  </Accordion>
  <Accordion title="OpenCode Zen">
    提示输入 `OPENCODE_API_KEY`（或 `OPENCODE_ZEN_API_KEY`）。
    设置 URL：[opencode.ai/auth](https://opencode.ai/auth)。
  </Accordion>
  <Accordion title="API 密钥（通用）">
    为您存储密钥。
  </Accordion>
  <Accordion title="Vercel AI Gateway">
    提示输入 `AI_GATEWAY_API_KEY`。
    更多详情：[Vercel AI Gateway](/providers/vercel-ai-gateway)。
  </Accordion>
  <Accordion title="Cloudflare AI Gateway">
    提示输入账号 ID、Gateway ID 和 `CLOUDFLARE_AI_GATEWAY_API_KEY`。
    更多详情：[Cloudflare AI Gateway](/providers/cloudflare-ai-gateway)。
  </Accordion>
  <Accordion title="MiniMax M2.5">
    配置自动写入。
    更多详情：[MiniMax](/providers/minimax)。
  </Accordion>
  <Accordion title="Synthetic（Anthropic 兼容）">
    提示输入 `SYNTHETIC_API_KEY`。
    更多详情：[Synthetic](/providers/synthetic)。
  </Accordion>
  <Accordion title="Moonshot 和 Kimi Coding">
    Moonshot（Kimi K2）和 Kimi Coding 配置自动写入。
    更多详情：[Moonshot AI (Kimi + Kimi Coding)](/providers/moonshot)。
  </Accordion>
  <Accordion title="自定义提供商">
    适用于 OpenAI 兼容和 Anthropic 兼容端点。

    交互式入门支持与其他提供商 API 密钥流程相同的存储选择：
    - **立即粘贴 API 密钥**（明文）
    - **使用密钥引用**（env 引用或已配置的提供商引用，带预检验证）

    非交互式标志：
    - `--auth-choice custom-api-key`
    - `--custom-base-url`
    - `--custom-model-id`
    - `--custom-api-key`（可选；回退到 `CUSTOM_API_KEY`）
    - `--custom-provider-id`（可选）
    - `--custom-compatibility <openai|anthropic>`（可选；默认 `openai`）

  </Accordion>
  <Accordion title="跳过">
    不配置认证。
  </Accordion>
</AccordionGroup>

模型行为：

- 从检测到的选项中选择默认模型，或手动输入提供商和模型。
- 向导运行模型检查，当配置的模型未知或缺少认证时发出警告。

凭证和配置文件路径：

- OAuth 凭证：`~/.openclaw/credentials/oauth.json`
- 认证配置文件（API 密钥 + OAuth）：`~/.openclaw/agents/<agentId>/agent/auth-profiles.json`

凭证存储模式：

- 默认入门行为将 API 密钥以明文值形式持久化到认证配置文件中。
- `--secret-input-mode ref` 启用引用模式替代明文密钥存储。
  在交互式入门中，您可以选择：
  - 环境变量引用（例如 `keyRef: { source: "env", provider: "default", id: "OPENAI_API_KEY" }`）
  - 已配置的提供商引用（`file` 或 `exec`），使用提供商别名 + id
- 交互式引用模式在保存前运行快速预检验证。
  - Env 引用：验证变量名 + 当前入门环境中的非空值。
  - 提供商引用：验证提供商配置并解析请求的 id。
  - 如果预检失败，入门显示错误并允许重试。
- 在非交互模式下，`--secret-input-mode ref` 仅支持 env 方式。
  - 在入门进程环境中设置提供商的环境变量。
  - 内联密钥标志（例如 `--openai-api-key`）要求设置该环境变量；否则入门快速失败。
  - 对于自定义提供商，非交互 `ref` 模式将 `models.providers.<id>.apiKey` 存储为 `{ source: "env", provider: "default", id: "CUSTOM_API_KEY" }`。
  - 在该自定义提供商情况下，`--custom-api-key` 要求设置 `CUSTOM_API_KEY`；否则入门快速失败。
- Gateway 认证凭证在交互式入门中支持明文和 SecretRef 选择：
  - 令牌模式：**生成/存储明文令牌**（默认）或**使用 SecretRef**。
  - 密码模式：明文或 SecretRef。
- 非交互式令牌 SecretRef 路径：`--gateway-token-ref-env <ENV_VAR>`。
- 现有的明文设置继续正常工作。

<Note>
无头和服务器提示：在有浏览器的机器上完成 OAuth，然后将
`~/.openclaw/credentials/oauth.json`（或 `$OPENCLAW_STATE_DIR/credentials/oauth.json`）
复制到 Gateway 主机。
</Note>

## 输出和内部原理

`~/.openclaw/openclaw.json` 中的典型字段：

- `agents.defaults.workspace`
- `agents.defaults.model` / `models.providers`（如果选择了 Minimax）
- `tools.profile`（本地入门在未设置时默认为 `"messaging"`；保留现有的显式值）
- `gateway.*`（mode、bind、auth、tailscale）
- `session.dmScope`（本地入门在未设置时默认为 `per-channel-peer`；保留现有的显式值）
- `channels.telegram.botToken`、`channels.discord.token`、`channels.signal.*`、`channels.imessage.*`
- 频道允许列表（Slack、Discord、Matrix、Microsoft Teams）当您在提示中选择启用时（名称尽可能解析为 ID）
- `skills.install.nodeManager`
- `wizard.lastRunAt`
- `wizard.lastRunVersion`
- `wizard.lastRunCommit`
- `wizard.lastRunCommand`
- `wizard.lastRunMode`

`openclaw agents add` 写入 `agents.list[]` 和可选的 `bindings`。

WhatsApp 凭证存储在 `~/.openclaw/credentials/whatsapp/<accountId>/` 下。
会话存储在 `~/.openclaw/agents/<agentId>/sessions/` 下。

<Note>
某些频道以插件形式交付。在入门时选择后，向导会在频道配置之前提示安装插件（npm 或本地路径）。
</Note>

Gateway 向导 RPC：

- `wizard.start`
- `wizard.next`
- `wizard.cancel`
- `wizard.status`

客户端（macOS 应用和控制 UI）可以在不重新实现入门逻辑的情况下渲染步骤。

Signal 设置行为：

- 下载适当的发布资源
- 存储到 `~/.openclaw/tools/signal-cli/<version>/` 下
- 在配置中写入 `channels.signal.cliPath`
- JVM 构建需要 Java 21
- 在可用时使用原生构建
- Windows 使用 WSL2 并在 WSL 内遵循 Linux signal-cli 流程

## 相关文档

- 入门中心：[入门向导 (CLI)](/start/wizard)
- 自动化和脚本：[CLI 自动化](/start/wizard-cli-automation)
- 命令参考：[`openclaw onboard`](/cli/onboard)
